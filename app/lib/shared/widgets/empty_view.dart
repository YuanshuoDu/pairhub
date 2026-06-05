// Reusable empty-state view.

import 'package:flutter/material.dart';

import '../extensions/context.dart';

class EmptyView extends StatelessWidget {
  const EmptyView({
    required this.title,
    super.key,
    this.message,
    this.icon = Icons.inbox_outlined,
    this.action,
  });


  final String title;
  final String? message;
  final IconData icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(icon, size: 56, color: context.colorScheme.outline),
            const SizedBox(height: 12),
            Text(title, style: context.text.titleMedium),
            if (message != null) ...<Widget>[
              const SizedBox(height: 4),
              Text(
                message!,
                style: context.text.bodySmall,
                textAlign: TextAlign.center,
              ),
            ],
            if (action != null) ...<Widget>[
              const SizedBox(height: 16),
              action!,
            ],
          ],
        ),
      ),
    );
  }
}
