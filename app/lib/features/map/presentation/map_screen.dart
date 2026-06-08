// Map screen — issue #35 (real MapboxMap, v2).
//
// Replaces the PR #56 placeholder with a real `MapboxMap` widget
// from `mapbox_gl` ^0.16. The plugin's API in 0.16 is intentionally
// minimal (MapboxMap, CameraPosition, controller.addSymbol) — we
// stick to that surface so future Flutter / plugin upgrades stay
// compatible.
//
// Token strategy: per the 0.16 docs, the access token is read from
// a `String.fromEnvironment("ACCESS_TOKEN")` and passed to the
// widget's `accessToken` parameter. The Dart side also passes the
// same token to `MapboxConfig` so the rest of the app can read it.
//
// We declare the layer as `MapboxMap` (no prefix); the older `import
// 'package:mapbox_gl/mapbox_gl.dart' as mapbox;` pattern only matters
// when shadowing Mapbox's own `LatLng` against Flutter's `LatLng`,
// which we don't need because the Flutter SDK doesn't expose one.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart' as geo;
import 'package:go_router/go_router.dart';
import 'package:mapbox_gl/mapbox_gl.dart' as mb;

import '../../../core/router/app_router.dart';
import '../../activity/data/activity_model.dart';
import '../../activity/application/activity_providers.dart';

class MapScreen extends ConsumerStatefulWidget {
  const MapScreen({super.key});

  @override
  ConsumerState<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends ConsumerState<MapScreen> {
  mb.MapboxMapController? _controller;
  final List<mb.Symbol> _symbols = <mb.Symbol>[];

  geo.Position? _userPosition;
  int _radiusKm = 5;
  String? _typeFilter;
  bool _locating = false;

  /// Public Mapbox access token. Build with:
  ///   flutter run --dart-define ACCESS_TOKEN=pk.eyJ…
  /// In production this is injected by the CI build (see
  /// android-setup.md / ios-metadata.md). Empty string falls back
  /// to the placeholder + helpful view.
  static const String _accessToken = String.fromEnvironment('ACCESS_TOKEN', defaultValue: '');

  @override
  void initState() {
    super.initState();
    _locate();
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  Future<void> _locate() async {
    if (_locating) return;
    setState(() => _locating = true);
    try {
      geo.LocationPermission perm = await geo.Geolocator.checkPermission();
      if (perm == geo.LocationPermission.denied) {
        perm = await geo.Geolocator.requestPermission();
      }
      if (perm == geo.LocationPermission.denied ||
          perm == geo.LocationPermission.deniedForever) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('需要位置权限以显示附近活动')),
        );
        return;
      }
      final geo.Position pos = await geo.Geolocator.getCurrentPosition();
      if (!mounted) return;
      setState(() => _userPosition = pos);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('定位失败：$e')),
      );
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  void _onMapCreated(mb.MapboxMapController controller) {
    _controller = controller;
    if (_userPosition != null) {
      controller.animateCamera(
        mb.CameraUpdate.newLatLngZoom(
          mb.LatLng(_userPosition!.latitude, _userPosition!.longitude),
          13,
        ),
      );
    }
  }

  /// Replace the symbol set with one per activity row. Called every
  /// time the nearby list changes (riverpod watcher).
  Future<void> _refreshSymbols(List<Activity> activities) async {
    final mb.MapboxMapController? c = _controller;
    if (c == null) return;
    // Clear old symbols first.
    for (final mb.Symbol s in _symbols) {
      try { await c.removeSymbol(s); } catch (_) { /* ignore */ }
    }
    _symbols.clear();

    for (final Activity a in activities) {
      try {
        final mb.Symbol s = await c.addSymbol(
          mb.SymbolOptions(
            geometry: mb.LatLng(a.locationLat, a.locationLng),
            iconImage: 'marker-15', // default Mapbox sprite; we don't ship a custom one yet
            textField: a.title,
            textSize: 12,
          ),
        );
        _symbols.add(s);
      } catch (_) {
        // If the style isn't ready (e.g. addSymbol called before
        // style is loaded) the controller throws. We swallow and
        // try again on the next build.
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_accessToken.isEmpty || !_accessToken.startsWith('pk.')) {
      return Scaffold(
        appBar: AppBar(title: const Text('附近活动')),
        body: const _MissingTokenView(),
      );
    }
    return Scaffold(
      appBar: AppBar(title: const Text('附近活动')),
      body: Stack(
        children: <Widget>[
          mb.MapboxMap(
            accessToken: _accessToken,
            initialCameraPosition: mb.CameraPosition(
              target: _userPosition != null
                  ? mb.LatLng(_userPosition!.latitude, _userPosition!.longitude)
                  : const mb.LatLng(39.9842, 116.3074),
              zoom: 13,
            ),
            onMapCreated: _onMapCreated,
            myLocationEnabled: _userPosition != null,
            styleString: 'mapbox://styles/mapbox/streets-v12',
          ),
          if (_userPosition != null) _NearbyList(
            lat: _userPosition!.latitude,
            lng: _userPosition!.longitude,
            radiusKm: _radiusKm,
            typeFilter: _typeFilter,
            onRadiusChange: (int v) => setState(() => _radiusKm = v),
            onTypeChange: (String? t) => setState(() => _typeFilter = t),
            onCardTap: (String id) => context.push(AppRoutes.activityPath(id)),
            onActivitiesLoaded: _refreshSymbols,
          )
          else
            const Positioned(
              left: 0, right: 0, bottom: 0,
              child: SizedBox(
                height: 220,
                child: ColoredBox(
                  color: Colors.white,
                  child: Center(child: Text('正在获取位置…')),
                ),
              ),
            ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _locating ? null : _locate,
        child: _locating
            ? const SizedBox(
                width: 24, height: 24,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : const Icon(Icons.my_location),
      ),
    );
  }
}

class _NearbyList extends ConsumerWidget {
  const _NearbyList({
    required this.lat,
    required this.lng,
    required this.radiusKm,
    required this.typeFilter,
    required this.onRadiusChange,
    required this.onTypeChange,
    required this.onCardTap,
    required this.onActivitiesLoaded,
  });

  final double lat;
  final double lng;
  final int radiusKm;
  final String? typeFilter;
  final ValueChanged<int> onRadiusChange;
  final ValueChanged<String?> onTypeChange;
  final ValueChanged<String> onCardTap;
  final Future<void> Function(List<Activity>) onActivitiesLoaded;

  static const List<_TypeChoice> _types = <_TypeChoice>[
    _TypeChoice(null, '全部'),
    _TypeChoice('STUDY', '自习'),
    _TypeChoice('SPORTS', '运动'),
    _TypeChoice('BOARD_GAME', '桌游'),
    _TypeChoice('ONLINE_GAME', '开黑'),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<ActivityListState> async = ref.watch(
      nearbyActivitiesProvider((
        lat: lat, lng: lng, radiusKm: radiusKm, type: typeFilter,
      )),
    );

    // Forward resolved activities up so the parent can paint
    // symbols on the map. Guarded with a microtask so we don't
    // call setState during build.
    ref.listen<AsyncValue<ActivityListState>>(
      nearbyActivitiesProvider((
        lat: lat, lng: lng, radiusKm: radiusKm, type: typeFilter,
      )),
      (AsyncValue<ActivityListState>? prev, AsyncValue<ActivityListState> next) {
        next.whenData((ActivityListState s) {
          Future<void>.microtask(() => onActivitiesLoaded(s.items));
        });
      },
    );

    return DraggableScrollableSheet(
      initialChildSize: 0.35,
      minChildSize: 0.2,
      maxChildSize: 0.85,
      builder: (BuildContext context, ScrollController scrollCtl) {
        return Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
            boxShadow: <BoxShadow>[
              BoxShadow(blurRadius: 12, color: Color(0x22000000), offset: Offset(0, -2)),
            ],
          ),
          child: ListView(
            controller: scrollCtl,
            padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
            children: <Widget>[
              Center(
                child: Container(
                  width: 36, height: 4,
                  decoration: BoxDecoration(
                    color: Colors.grey.shade300,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              _RadiusSlider(value: radiusKm, onChange: onRadiusChange),
              const SizedBox(height: 8),
              SizedBox(
                height: 40,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: _types.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                  itemBuilder: (BuildContext context, int i) {
                    final _TypeChoice t = _types[i];
                    final bool active = t.value == typeFilter;
                    return ChoiceChip(
                      label: Text(t.label),
                      selected: active,
                      onSelected: (bool s) => onTypeChange(s ? t.value : null),
                    );
                  },
                ),
              ),
              const Divider(height: 24),
              async.when(
                data: (ActivityListState s) {
                  if (s.items.isEmpty) {
                    return const Padding(
                      padding: EdgeInsets.all(24),
                      child: Center(child: Text('当前范围内暂无活动')),
                    );
                  }
                  return Column(
                    children: <Widget>[
                      for (final Activity a in s.items)
                        ListTile(
                          dense: true,
                          title: Text(a.title),
                          subtitle: Text(
                            '${a.locationName} · ${a.currentCount}/${a.maxParticipants}',
                          ),
                          trailing: a.distanceKm != null
                              ? Text(
                                  '${a.distanceKm!.toStringAsFixed(1)} km',
                                  style: const TextStyle(
                                    color: Colors.blue,
                                    fontWeight: FontWeight.w500,
                                  ),
                                )
                              : null,
                          onTap: () => onCardTap(a.id),
                        ),
                    ],
                  );
                },
                error: (Object e, _) => Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text('加载失败：$e',
                      style: const TextStyle(color: Colors.red)),
                ),
                loading: () => const Padding(
                  padding: EdgeInsets.all(24),
                  child: Center(child: CircularProgressIndicator()),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _RadiusSlider extends StatelessWidget {
  const _RadiusSlider({required this.value, required this.onChange});
  final int value;
  final ValueChanged<int> onChange;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: <Widget>[
        const Text('半径', style: TextStyle(fontSize: 13)),
        Expanded(
          child: Slider(
            value: value.toDouble(),
            min: 1, max: 50, divisions: 49,
            label: '$value km',
            onChanged: (double v) => onChange(v.round()),
          ),
        ),
        SizedBox(
          width: 56,
          child: Text('$value km',
              textAlign: TextAlign.right,
              style: const TextStyle(
                  fontSize: 13, fontWeight: FontWeight.w600)),
        ),
      ],
    );
  }
}

class _TypeChoice {
  const _TypeChoice(this.value, this.label);
  final String? value;
  final String label;
}

class _MissingTokenView extends StatelessWidget {
  const _MissingTokenView();
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: const <Widget>[
          Text('🗺️', style: TextStyle(fontSize: 64)),
          SizedBox(height: 16),
          Text('Mapbox 视图未配置',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
          SizedBox(height: 8),
          Text(
            '请用 --dart-define ACCESS_TOKEN=pk.eyJ… 重新构建。\n完整步骤见 docs/release/android-setup.md 与 ios-metadata.md。',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 13, color: Colors.black54),
          ),
        ],
      ),
    );
  }
}
