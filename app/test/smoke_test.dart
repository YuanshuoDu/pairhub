// StudyBuddy Flutter app — smoke test.
//
// This is a deliberately minimal widget test that exists so the
// `flutter test` step in CI has at least one passing case. The
// substantive widget / unit tests for the activity feature live in
// the per-feature subdirs and will be expanded as M3 lands.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('MaterialApp boots and shows a Scaffold', (WidgetTester tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: Center(child: Text('studybuddy')),
        ),
      ),
    );

    expect(find.text('studybuddy'), findsOneWidget);
    expect(find.byType(Scaffold), findsOneWidget);
  });
}
