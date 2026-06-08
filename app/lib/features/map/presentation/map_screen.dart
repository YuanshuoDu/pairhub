// Map screen — issue #35 (Flutter side, v1 placeholder).
//
// What this PR ships:
//   - A route + a screen the user can navigate to from the activity list.
//   - The screen renders a "Mapbox coming soon" placeholder with the
//     list of nearby activities underneath, using the
//     `GET /api/v1/activities?lat=&lng=&radiusKm=` endpoint
//     (PR #53 backend) — same UX as the miniprogram's list view in
//     PR #55. Tap a card → activity detail.
//
// What this PR does NOT ship (deferred to M3 W2 once #31 lands):
//   - Real Mapbox map rendering. The mapbox_gl plugin's 0.16 API
//     surface drifts quickly (MyLocationTrackingMode enum members,
//     MapboxOptions vs MapboxMap.options, etc.); integrating it
//     properly needs a working Android scaffold and Mapbox gradle
//     config that don't exist yet on this branch. The plugin is
//     already declared in pubspec.yaml so the wiring is ready when
//     Android lands.
//
// The screen reads its location via the existing `geolocator` package
// (already a transitive dep of mapbox_gl) and falls back gracefully
// when permission is denied.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart' as geo;
import 'package:go_router/go_router.dart';

import '../../../core/router/app_router.dart';
import '../../activity/data/activity_model.dart';
import '../../activity/application/activity_providers.dart';

class MapScreen extends ConsumerStatefulWidget {
  const MapScreen({super.key});

  @override
  ConsumerState<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends ConsumerState<MapScreen> {
  geo.Position? _userPosition;
  int _radiusKm = 5;
  String? _typeFilter;
  bool _locating = false;

  @override
  void initState() {
    super.initState();
    _locate();
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('附近活动'),
      ),
      body: Column(
        children: <Widget>[
          _MapPlaceholder(
            position: _userPosition,
            locating: _locating,
          ),
          if (_userPosition != null) _NearbyList(
            lat: _userPosition!.latitude,
            lng: _userPosition!.longitude,
            radiusKm: _radiusKm,
            typeFilter: _typeFilter,
            onRadiusChange: (int v) => setState(() => _radiusKm = v),
            onTypeChange: (String? t) => setState(() => _typeFilter = t),
            onCardTap: (String id) =>
                context.push(AppRoutes.activityPath(id)),
          )
          else
            const Expanded(
              child: Center(child: Text('正在获取位置…')),
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

class _MapPlaceholder extends StatelessWidget {
  const _MapPlaceholder({required this.position, required this.locating});
  final geo.Position? position;
  final bool locating;

  @override
  Widget build(BuildContext context) {
    final ColorScheme cs = Theme.of(context).colorScheme;
    return Container(
      height: 220,
      width: double.infinity,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: <Color>[
            cs.primary.withOpacity(0.15),
            cs.primary.withOpacity(0.05),
          ],
        ),
        border: Border(bottom: BorderSide(color: cs.outlineVariant)),
      ),
      child: Stack(
        children: <Widget>[
          Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Icon(Icons.map_outlined, size: 48, color: cs.primary),
                const SizedBox(height: 8),
                Text(
                  position == null
                      ? (locating ? '定位中…' : '点击右下角定位')
                      : 'Mapbox 地图（开发中）',
                  style: Theme.of(context).textTheme.titleSmall,
                ),
                if (position != null) ...<Widget>[
                  const SizedBox(height: 4),
                  Text(
                    'lat ${position!.latitude.toStringAsFixed(4)} · lng ${position!.longitude.toStringAsFixed(4)}',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ],
            ),
          ),
          const Positioned(
            top: 8, right: 8,
            child: _M3W2Badge(),
          ),
        ],
      ),
    );
  }
}

class _M3W2Badge extends StatelessWidget {
  const _M3W2Badge();
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.amber.shade100,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text('M3 W2 接入',
          style: TextStyle(fontSize: 11, color: Colors.amber.shade900)),
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
  });

  final double lat;
  final double lng;
  final int radiusKm;
  final String? typeFilter;
  final ValueChanged<int> onRadiusChange;
  final ValueChanged<String?> onTypeChange;
  final ValueChanged<String> onCardTap;

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

    return Expanded(
      child: Column(
        children: <Widget>[
          _RadiusSlider(value: radiusKm, onChange: onRadiusChange),
          SizedBox(
            height: 44,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: _types.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (BuildContext context, int i) {
                final _TypeChoice t = _types[i];
                final bool active = t.value == typeFilter;
                return FilterChip(
                  label: Text(t.label),
                  selected: active,
                  onSelected: (bool s) => onTypeChange(s ? t.value : null),
                );
              },
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: async.when(
              data: (ActivityListState s) {
                if (s.items.isEmpty) {
                  return const Center(child: Text('当前范围内暂无活动'));
                }
                return ListView.separated(
                  itemCount: s.items.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (BuildContext context, int i) {
                    final Activity a = s.items[i];
                    return ListTile(
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
                    );
                  },
                );
              },
              error: (Object e, _) => Center(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text('加载失败：$e',
                      style: const TextStyle(color: Colors.red)),
                ),
              ),
              loading: () => const Center(child: CircularProgressIndicator()),
            ),
          ),
        ],
      ),
    );
  }
}

class _RadiusSlider extends StatelessWidget {
  const _RadiusSlider({required this.value, required this.onChange});
  final int value;
  final ValueChanged<int> onChange;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: Row(
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
      ),
    );
  }
}

class _TypeChoice {
  const _TypeChoice(this.value, this.label);
  final String? value;
  final String label;
}
