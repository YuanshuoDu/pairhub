// Profile page — scaffold.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_state.dart';
import '../../core/router/app_router.dart';
import '../../core/theme/app_colors.dart';
import '../../shared/extensions/context.dart';

class ProfilePage extends ConsumerWidget {
  const ProfilePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AuthState auth = ref.watch(authStateProvider);
    final String? nickname = auth.user?.nickname;
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
        title: const Text('我的'),
        actions: <Widget>[
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: '退出登录',
            onPressed: () async {
              await ref.read(authStateProvider.notifier).signOut();
              if (context.mounted) context.go(AppRoutes.login);
            },
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: <Widget>[
          // Header
          Row(
            children: <Widget>[
              CircleAvatar(
                radius: 32,
                backgroundColor: AppColors.primaryContainer,
                child: Icon(
                  Icons.person,
                  size: 32,
                  color: context.colorScheme.onPrimaryContainer,
                ),
              ),
              const SizedBox(width: AppSpacing.lg),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      nickname ?? '未登录',
                      style: context.text.titleLarge,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      auth.user?.school ?? '完善学校信息，认识更多搭子',
                      style: context.text.bodySmall,
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.xl),
          // Stats row (placeholder)
          const Row(
            children: <Widget>[
              _StatCard(label: '我创建', value: '0'),
              SizedBox(width: AppSpacing.md),
              _StatCard(label: '我参加', value: '0'),
              SizedBox(width: AppSpacing.md),
              _StatCard(label: '评价', value: '0'),
            ],
          ),
          const SizedBox(height: AppSpacing.xl),
          // Sections
          _SectionTile(
            icon: Icons.list_alt,
            title: '我创建的活动',
            onTap: () {},
          ),
          _SectionTile(
            icon: Icons.event_available,
            title: '我参加的活动',
            onTap: () {},
          ),
          _SectionTile(
            icon: Icons.settings_outlined,
            title: '设置',
            onTap: () {},
          ),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Card(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.lg),
          child: Column(
            children: <Widget>[
              Text(value, style: context.text.headlineMedium),
              const SizedBox(height: 4),
              Text(label, style: context.text.bodySmall),
            ],
          ),
        ),
      ),
    );
  }
}

class _SectionTile extends StatelessWidget {
  const _SectionTile({required this.icon, required this.title, required this.onTap});
  final IconData icon;
  final String title;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: ListTile(
        leading: Icon(icon),
        title: Text(title),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }
}
