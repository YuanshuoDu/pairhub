// Login page — scaffold with Apple + Google sign-in buttons.
//
// Behaviour is intentionally minimal: the buttons call into the auth
// notifier and react to loading / error state. The actual OAuth dance
// lives in core/auth/auth_service.dart.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_state.dart';
import '../../core/router/app_router.dart';
import '../../core/theme/app_colors.dart';
import '../../shared/extensions/context.dart';
import '../../shared/widgets/loading_view.dart';

class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  bool _busy = false;

  Future<void> _signInWithApple() async {
    setState(() => _busy = true);
    try {
      await ref.read(authStateProvider.notifier).signInWithApple();
      if (mounted) context.go(AppRoutes.home);
    } on Exception catch (e) {
      if (mounted) _showError(e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _signInWithGoogle() async {
    setState(() => _busy = true);
    try {
      await ref.read(authStateProvider.notifier).signInWithGoogle();
      if (mounted) context.go(AppRoutes.home);
    } on Exception catch (e) {
      if (mounted) _showError(e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('登录失败: $message')),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_busy) {
      return const Scaffold(body: LoadingView(label: '登录中…'));
    }
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              const Spacer(),
              // Logo placeholder
              Center(
                child: Container(
                  width: 96,
                  height: 96,
                  decoration: BoxDecoration(
                    color: AppColors.primaryContainer,
                    borderRadius: BorderRadius.circular(AppRadius.xl),
                  ),
                  child: Icon(
                    Icons.school_outlined,
                    size: 56,
                    color: context.colorScheme.onPrimaryContainer,
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.xl),
              Text(
                'StudyBuddy',
                style: context.text.displayMedium,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                '让留学生 30 秒内找到搭子',
                style: context.text.bodyMedium?.copyWith(
                  color: context.colorScheme.onSurfaceVariant,
                ),
                textAlign: TextAlign.center,
              ),
              const Spacer(),
              // Apple
              _SocialButton(
                icon: Icons.apple,
                label: '通过 Apple 继续',
                background: Colors.black,
                foreground: Colors.white,
                onPressed: _signInWithApple,
              ),
              const SizedBox(height: AppSpacing.md),
              // Google
              _SocialButton(
                icon: Icons.g_mobiledata,
                label: '通过 Google 继续',
                background: Colors.white,
                foreground: Colors.black87,
                borderColor: context.colorScheme.outline,
                onPressed: _signInWithGoogle,
              ),
              const SizedBox(height: AppSpacing.xl),
              Text(
                '继续即表示同意《用户协议》和《隐私政策》',
                style: context.text.bodySmall,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: AppSpacing.lg),
            ],
          ),
        ),
      ),
    );
  }
}

class _SocialButton extends StatelessWidget {
  const _SocialButton({
    required this.icon,
    required this.label,
    required this.background,
    required this.foreground,
    required this.onPressed,
    this.borderColor,
  });

  final IconData icon;
  final String label;
  final Color background;
  final Color foreground;
  final Color? borderColor;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 52,
      child: ElevatedButton(
        onPressed: onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: background,
          foregroundColor: foreground,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.lg),
            side: borderColor != null
                ? BorderSide(color: borderColor!)
                : BorderSide.none,
          ),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            Icon(icon, size: 24),
            const SizedBox(width: AppSpacing.sm),
            Text(label, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}
