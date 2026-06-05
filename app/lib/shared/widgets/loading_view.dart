// Reusable loading view with optional label.
//
// Used everywhere we wait on the network.

import 'package:flutter/material.dart';

import '../extensions/context.dart';

class LoadingView extends StatelessWidget {
  const LoadingView({super.key, this.label});

  final String? label;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          const CircularProgressIndicator.adaptive(),
          if (label != null) ...<Widget>[
            const SizedBox(height: 16),
            Text(label!, style: context.text.bodyMedium),
          ],
        ],
      ),
    );
  }
}
