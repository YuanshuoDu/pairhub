// Create activity page — scaffold.
//
// The real flow will be a 4-step wizard (type → info → time/location → confirm)
// per docs/spec-v0.1 §3. This scaffold renders a single placeholder form so
// the route is reachable and the W2 work can build on top.

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/design_tokens.dart';
import '../../shared/extensions/context.dart';
import '../../shared/models/activity.dart';

class CreateActivityPage extends StatefulWidget {
  const CreateActivityPage({super.key});

  @override
  State<CreateActivityPage> createState() => _CreateActivityPageState();
}

class _CreateActivityPageState extends State<CreateActivityPage> {
  ActivityType _type = ActivityType.study;
  final TextEditingController _title = TextEditingController();
  final TextEditingController _description = TextEditingController();

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: () => context.pop(),
        ),
        title: const Text('创建活动'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(DesignSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text('活动类型', style: context.text.titleMedium),
            const SizedBox(height: DesignSpacing.sm),
            Wrap(
              spacing: DesignSpacing.sm,
              children: ActivityType.values
                  .map((ActivityType t) => ChoiceChip(
                        label: Text(t.label),
                        selected: _type == t,
                        onSelected: (_) => setState(() => _type = t),
                      ))
                  .toList(),
            ),
            const SizedBox(height: DesignSpacing.xl),
            Text('标题', style: context.text.titleMedium),
            const SizedBox(height: DesignSpacing.sm),
            TextField(
              controller: _title,
              decoration: const InputDecoration(hintText: '例如：周末去图书馆'),
            ),
            const SizedBox(height: DesignSpacing.lg),
            Text('描述', style: context.text.titleMedium),
            const SizedBox(height: DesignSpacing.sm),
            TextField(
              controller: _description,
              maxLines: 4,
              decoration: const InputDecoration(hintText: '简单介绍活动安排'),
            ),
            const SizedBox(height: DesignSpacing.xxl),
            // Placeholder for Step3 (map / time) — full implementation in W2.
            Container(
              height: 200,
              decoration: BoxDecoration(
                color: DesignColors.primaryContainer,
                borderRadius: BorderRadius.circular(DesignRadius.lg),
              ),
              child: Center(
                child: Text(
                  '地图选点 · 时间设置\n（W2 接入）',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: context.colorScheme.onPrimaryContainer),
                ),
              ),
            ),
            const SizedBox(height: DesignSpacing.xl),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('提交逻辑待 W2 接入')),
                  );
                },
                child: const Text('下一步'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
