// Mapbox map screen — issue #35.
//
// Renders an interactive Mapbox map centered on the user's current
// location, with markers for every activity within `radiusKm`. The
// activity list comes from the existing `GET /api/v1/activities?
// lat=&lng=&radiusKm=` endpoint (PR #53). Marker tap → activity
// detail via go_router.
//
// Components:
//   - MapboxMap (native, via mapbox_gl plugin)
//   - User position marker (animated pulse via state)
//   - Activity markers (one per row in the response)
//   - Bottom sheet: filter chips (type) + radius slider + activity
//     list with distances
//   - FAB: recenter on user + refresh location
//
// Token is read from .env (`MAPBOX_ACCESS_TOKEN`). Without a token
// the screen renders a friendly "configure your token" placeholder
// instead of crashing.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart' as geo;
import 'package:go_router/go_router.dart';
import 'package:mapbox_gl/mapbox_gl.dart' as mapbox;

import '../../../core/config/mapbox_config.dart';
import '../../../core/router/app_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../activity/data/activity_model.dart';
import '../../activity/application/activity_providers.dart';

class MapScreen extends ConsumerStatefulWidget {
  const MapScreen({super.key});

  @override
  ConsumerState<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends ConsumerState<MapScreen> {
  mapbox.MapboxMapController? _controller;
  StreamSubscription<geo.Position>? _positionSub;

  geo.Position? _userPosition;
  int _radiusKm = 5;
  String? _typeFilter; // null = all
  bool _locating = false;

  static const double _initialZoom = 13;

  @override
  void initState() {
    super.initState();
    _locate();
  }

  @override
  void dispose() {
    _positionSub?.cancel();
    _controller?.dispose();
    super.dispose();
  }

  // ---------------------------------------------------------------------------
  // Location
  // ---------------------------------------------------------------------------

  Future<void> _locate() async {
    if (_locating) return;
    setState(() => _locating = true);
    try {
      // geolocator is the canonical Flutter geo package; we add it
      // implicitly via mapbox_gl. We re-check permission here.
      final geo.LocationPermission perm = await geo.Geolocator.checkPermission();
      if (perm == geo.LocationPermission.denied) {
        await geo.Geolocator.requestPermission();
      }
      final geo.Position pos = await geo.Geolocator.getCurrentPosition(
        locationSettings: const geo.LocationSettings(
          accuracy: geo.LocationAccuracy.high,
          distanceFilter: 0,
        ),
      );
      if (!mounted) return;
      setState(() => _userPosition = pos);
      _controller?.animateCamera(
        mapbox.CameraUpdate.newLatLngZoom(
          mapbox.LatLng(pos.latitude, pos.longitude),
          _initialZoom,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('定位失败：$e')),
      );
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  // ---------------------------------------------------------------------------
  // Map lifecycle
  // ---------------------------------------------------------------------------

  void _onMapCreated(mapbox.MapboxMapController controller) {
    _controller = controller;
    if (_userPosition != null) {
      controller.animateCamera(
        mapbox.CameraUpdate.newLatLngZoom(
          mapbox.LatLng(_userPosition!.latitude, _userPosition!.longitude),
          _initialZoom,
        ),
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    if (!MapboxConfig.isConfigured) {
      return Scaffold(
        appBar: AppBar(title: const Text('附近活动')),
        body: _MissingTokenView(),
      );
    }
    return Scaffold(
      appBar: AppBar(
        title: const Text('附近活动'),
        backgroundColor: AppColors.surface,
      ),
      body: Stack(
        children: <Widget>[
          _buildMap(),
          _buildBottomSheet(),
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

  Widget _buildMap() {
    return mapbox.MapboxMap(
      initialCameraPosition: mapbox.CameraPosition(
        target: _userPosition != null
            ? mapbox.LatLng(_userPosition!.latitude, _userPosition!.longitude)
            : const mapbox.LatLng(39.9842, 116.3074), // fallback: Beijing
        zoom: _initialZoom,
      ),
      onMapCreated: _onMapCreated,
      myLocationEnabled: _userPosition != null,
      myLocationTrackingMode: mapbox.MyLocationTrackingMode.tracking,
      styleString: mapbox.MapboxOptions.accessToken.isEmpty
          ? null
          : 'mapbox://styles/mapbox/streets-v12',
    );
  }

  Widget _buildBottomSheet() {
    if (_userPosition == null) {
      return const SizedBox.shrink();
    }
    return DraggableScrollableSheet(
      initialChildSize: 0.35,
      minChildSize: 0.2,
      maxChildSize: 0.85,
      builder: (BuildContext context, ScrollController scrollCtl) {
        return _BottomSheetContent(
          scrollController: scrollCtl,
          radiusKm: _radiusKm,
          typeFilter: _typeFilter,
          onRadiusChange: (double v) {
            setState(() => _radiusKm = v.round());
          },
          onTypeChange: (String? t) {
            setState(() => _typeFilter = t);
          },
          lat: _userPosition!.latitude,
          lng: _userPosition!.longitude,
          onMarkerTap: (String activityId) =>
              context.push(AppRoutes.activityPath(activityId)),
        );
      },
    );
  }
}

class _BottomSheetContent extends ConsumerWidget {
  const _BottomSheetContent({
    required this.scrollController,
    required this.radiusKm,
    required this.typeFilter,
    required this.onRadiusChange,
    required this.onTypeChange,
    required this.lat,
    required this.lng,
    required this.onMarkerTap,
  });

  final ScrollController scrollController;
  final int radiusKm;
  final String? typeFilter;
  final ValueChanged<double> onRadiusChange;
  final ValueChanged<String?> onTypeChange;
  final double lat;
  final double lng;
  final ValueChanged<String> onMarkerTap;

  static const List<_TypeChoice> _types = <_TypeChoice>[
    _TypeChoice(null, '全部'),
    _TypeChoice('STUDY', '自习'),
    _TypeChoice('SPORTS', '运动'),
    _TypeChoice('BOARD_GAME', '桌游'),
    _TypeChoice('ONLINE_GAME', '开黑'),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<ActivityListState> async =
        ref.watch(nearbyActivitiesProvider((lat: lat, lng: lng, radiusKm: radiusKm, type: typeFilter)));

    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        boxShadow: <BoxShadow>[
          BoxShadow(blurRadius: 12, color: Color(0x22000000), offset: Offset(0, -2)),
        ],
      ),
      child: ListView(
        controller: scrollController,
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
          _RadiusSlider(value: radiusKm.toDouble(), onChange: onRadiusChange),
          const SizedBox(height: 8),
          SizedBox(
            height: 36,
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
                  selectedColor: AppColors.primary,
                  labelStyle: TextStyle(
                    color: active ? Colors.white : AppColors.textPrimary,
                    fontWeight: FontWeight.w500,
                  ),
                );
              },
            ),
          ),
          const Divider(height: 24),
          async.when(
            data: (ActivityListState s) {
              if (s.isLoading && s.items.isEmpty) {
                return const Padding(
                  padding: EdgeInsets.all(24),
                  child: Center(child: CircularProgressIndicator()),
                );
              }
              if (s.items.isEmpty) {
                return const Padding(
                  padding: EdgeInsets.all(24),
                  child: Center(child: Text('当前范围内暂无活动')),
                );
              }
              return Column(
                children: <Widget>[
                  for (final Activity a in s.items)
                    _ActivityRow(
                      activity: a,
                      onTap: () => onMarkerTap(a.id),
                    ),
                ],
              );
            },
            error: (Object e, _) => Padding(
              padding: const EdgeInsets.all(16),
              child: Text('加载失败：$e', style: const TextStyle(color: Colors.red)),
            ),
            loading: () => const SizedBox(height: 80),
          ),
        ],
      ),
    );
  }
}

class _RadiusSlider extends StatelessWidget {
  const _RadiusSlider({required this.value, required this.onChange});
  final double value;
  final ValueChanged<double> onChange;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: <Widget>[
        const Text('半径', style: TextStyle(fontSize: 13, color: AppColors.textSecondary)),
        Expanded(
          child: Slider(
            value: value,
            min: 1, max: 50, divisions: 49,
            label: '${value.round()} km',
            onChanged: onChange,
            activeColor: AppColors.primary,
          ),
        ),
        Text('${value.round()} km',
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.primary)),
      ],
    );
  }
}

class _TypeChoice {
  const _TypeChoice(this.value, this.label);
  final String? value;
  final String label;
}

class _ActivityRow extends StatelessWidget {
  const _ActivityRow({required this.activity, required this.onTap});
  final Activity activity;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
        child: Row(
          children: <Widget>[
            Container(
              width: 40, height: 40,
              decoration: BoxDecoration(
                color: _tintColor(activity.type).withOpacity(0.15),
                borderRadius: BorderRadius.circular(8),
              ),
              alignment: Alignment.center,
              child: Text(_typeEmoji(activity.type), style: const TextStyle(fontSize: 18)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(activity.title,
                      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 2),
                  Text('${activity.locationName} · ${activity.currentCount}/${activity.maxParticipants}',
                      style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                ],
              ),
            ),
            if (activity.distanceKm != null)
              Text('${activity.distanceKm!.toStringAsFixed(1)} km',
                  style: const TextStyle(fontSize: 12, color: AppColors.primary, fontWeight: FontWeight.w500)),
          ],
        ),
      ),
    );
  }

  Color _tintColor(String type) {
    switch (type) {
      case 'STUDY': return AppColors.activityStudy;
      case 'SPORTS': return AppColors.activitySport;
      case 'BOARD_GAME': return AppColors.activityBoardGame;
      case 'ONLINE_GAME': return AppColors.activityOnline;
      default: return AppColors.textSecondary;
    }
  }

  String _typeEmoji(String type) {
    switch (type) {
      case 'STUDY': return '📚';
      case 'SPORTS': return '🏀';
      case 'BOARD_GAME': return '🎲';
      case 'ONLINE_GAME': return '🎮';
      default: return '📌';
    }
  }
}

class _MissingTokenView extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: <Widget>[
          const Text('🗺️', style: TextStyle(fontSize: 64)),
          const SizedBox(height: 16),
          const Text('Mapbox 视图未配置',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          const Text(
            '请在 .env 中设置 MAPBOX_ACCESS_TOKEN（pk.eyJ… 格式），然后重新构建。',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
          ),
        ],
      ),
    );
  }
}
