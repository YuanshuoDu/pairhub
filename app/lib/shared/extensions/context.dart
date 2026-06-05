// BuildContext conveniences — saves a lot of `Theme.of(context).textTheme.bodyMedium`
// boilerplate in feature code.

import 'package:flutter/material.dart';

extension BuildContextX on BuildContext {
  ThemeData get theme => Theme.of(this);
  ColorScheme get colorScheme => Theme.of(this).colorScheme;
  TextTheme get text => Theme.of(this).textTheme;
  MediaQueryData get media => MediaQuery.of(this);
  EdgeInsets get safeArea => MediaQuery.of(this).padding;
  Size get screenSize => MediaQuery.of(this).size;

  /// True if the device is wider than 600dp (small tablet / foldable).
  bool get isTablet => screenSize.shortestSide >= 600;
}
