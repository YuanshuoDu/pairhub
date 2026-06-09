// Dashboard metrics — issue #32 frontend (Flutter half).
//
// 4 hero numbers in a 2×2 glass grid (Users / Activities / Signups /
// PushTokens). Tapping a card jumps to the corresponding search screen
// pre-filtered. Pull-to-refresh re-fetches the metrics.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/design_tokens.dart';
import '../../../shared/extensions/context.dart';
import '../../../shared/widgets/error_view.dart';
import '../../../shared/widgets/loading_view.dart';
import '../application/admin_providers.dart';
import '../data/admin_api.dart';
import 'activities_page.dart';
import 'users_page.dart';
import 'widgets/glass_card.dart';
import 'widgets/mesh_background.dart';

class AdminDashboardPage extends ConsumerWidget {
  const AdminDashboardPage({super.key});

  static const String routePath = '/admin';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<AdminDashboardMetrics> async =
        ref.watch(adminDashboardMetricsProvider);
    final bool reduced = MediaQuery.of(context).disableAnimations;

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: MeshBackground(
        animated: !reduced,
        child: SafeArea(
          child: async.when(
            loading: () => ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: const <Widget>[
                SizedBox(height: 120),
                LoadingView(label: '加载指标…'),
              ],
            ),
            error: (Object e, _) => ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: <Widget>[
                const SizedBox(height: 80),
                ErrorView(
                  message:
                      e is ApiException ? e.message : e.toString(),
                  onRetry: () =>
                      ref.invalidate(adminDashboardMetricsProvider),
                ),
              ],
            ),
            data: (AdminDashboardMetrics m) =>
                RefreshIndicator(
              onRefresh: () async {
                ref.invalidate(adminDashboardMetricsProvider);
                await ref.read(adminDashboardMetricsProvider.future);
              },
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(
                  DesignSpacing.lg,
                  DesignSpacing.lg,
                  DesignSpacing.lg,
                  DesignSpacing.xxl,
                ),
                children: <Widget>[
                  _Header(),
                  const SizedBox(height: DesignSpacing.xl),
                  _MetricsGrid(metrics: m),
                  const SizedBox(height: DesignSpacing.xl),
                  _QuickActions(),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(
          'STUDYBUDDY',
          style: context.text.bodySmall?.copyWith(
            letterSpacing: 4,
            color: context.colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: DesignSpacing.xs),
        Text('运营仪表盘', style: context.text.displayMedium),
        const SizedBox(height: DesignSpacing.xs),
        Text(
          'M3 启动期关键指标一览',
          style: context.text.bodyLarge,
        ),
      ],
    );
  }
}

class _MetricsGrid extends StatelessWidget {
  const _MetricsGrid({required this.metrics});
  final AdminDashboardMetrics metrics;

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      childAspectRatio: 1.05,
      mainAxisSpacing: DesignSpacing.md,
      crossAxisSpacing: DesignSpacing.md,
      children: <Widget>[
        _MetricCard(
          title: '用户',
          value: metrics.usersTotal,
          hint: '今日 +${metrics.usersNewToday} · '
              '本周 +${metrics.usersNewThisWeek}',
          icon: Icons.people_alt_rounded,
          accent: DesignColors.info,
          onTap: () => context.go(AdminUsersPage.routePath),
        ),
        _MetricCard(
          title: '活动',
          value: metrics.activitiesTotal,
          hint: '待审核 ${metrics.activitiesPending} · '
              '招募中 ${metrics.activitiesRecruiting}',
          icon: Icons.event_rounded,
          accent: DesignColors.success,
          onTap: () => context.go(AdminActivitiesPage.routePath),
        ),
        _MetricCard(
          title: '报名',
          value: metrics.signupsTotal,
          hint: '今日 +${metrics.signupsToday}',
          icon: Icons.how_to_reg_rounded,
          accent: DesignColors.warning,
          onTap: () => context.go(AdminActivitiesPage.routePath),
        ),
        _MetricCard(
          title: '推送 Token',
          value: metrics.pushTokensTotal,
          hint: 'iOS + Android 累计',
          icon: Icons.notifications_active_rounded,
          accent: DesignColors.textSecondary,
          onTap: () {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Push Token 管理（M3 W2）')),
            );
          },
        ),
      ],
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({
    required this.title,
    required this.value,
    required this.hint,
    required this.icon,
    required this.accent,
    required this.onTap,
  });

  final String title;
  final int value;
  final String hint;
  final IconData icon;
  final Color accent;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      onTap: onTap,
      padding: const EdgeInsets.all(DesignSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: <Widget>[
          Row(
            children: <Widget>[
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: accent.withOpacity(0.20),
                  borderRadius: BorderRadius.circular(GlassRadius.sm),
                ),
                child: Icon(icon, color: accent, size: 18),
              ),
              const Spacer(),
              Icon(
                Icons.arrow_outward_rounded,
                size: 16,
                color: DesignColors.onSurfaceVariant,
              ),
            ],
          ),
          const SizedBox(height: DesignSpacing.sm),
          Text(
            value.toString(),
            style: context.text.displayMedium?.copyWith(
              fontSize: 36,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: DesignSpacing.xs),
          Text(title, style: context.text.titleMedium),
          const SizedBox(height: 2),
          Text(
            hint,
            style: context.text.bodySmall,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}

class _QuickActions extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text('快捷入口', style: context.text.titleMedium),
        const SizedBox(height: DesignSpacing.md),
        Row(
          children: <Widget>[
            Expanded(
              child: _ActionButton(
                icon: Icons.fact_check_outlined,
                label: '审核队列',
                onTap: () => context.go(AdminActivitiesPage.routePath),
              ),
            ),
            const SizedBox(width: DesignSpacing.md),
            Expanded(
              child: _ActionButton(
                icon: Icons.people_outline,
                label: '用户管理',
                onTap: () => context.go(AdminUsersPage.routePath),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    HapticFeedback.selectionClick();
    return SizedBox(
      height: 56, // iOS HIG §8 — comfortable thumb target
      child: Glass(
        size: GlassSize.md,
        onTap: onTap,
        padding: const EdgeInsets.symmetric(horizontal: DesignSpacing.lg),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            Icon(icon, size: 20, color: DesignColors.onSurface),
            const SizedBox(width: DesignSpacing.sm),
            Text(
              label,
              style: context.text.titleMedium,
            ),
          ],
        ),
      ),
    );
  }
}
