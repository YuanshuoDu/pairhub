// Activity detail page — scaffold.

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/app_colors.dart';
import '../../shared/extensions/context.dart';

class ActivityDetailPage extends StatelessWidget {
  const ActivityDetailPage({required this.activityId, super.key});

  final String activityId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
        title: const Text('活动详情'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            // Placeholder hero
            AspectRatio(
              aspectRatio: 16 / 9,
              child: Container(
                decoration: BoxDecoration(
                  color: AppColors.primaryContainer,
                  borderRadius: BorderRadius.circular(AppRadius.lg),
                ),
                child: Center(
                  child: Icon(
                    Icons.image_outlined,
                    size: 48,
                    color: context.colorScheme.onPrimaryContainer,
                  ),
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
            Text('Activity #$activityId', style: context.text.headlineMedium),
            const SizedBox(height: AppSpacing.sm),
            Text('描述占位 — 业务实现后由 W2 接入。', style: context.text.bodyMedium),
            const SizedBox(height: AppSpacing.xl),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('报名功能待 W2 接入')),
                  );
                },
                icon: const Icon(Icons.check_circle_outline),
                label: const Text('报名参加'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
