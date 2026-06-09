// Admin gate page — issue #32 frontend (Flutter half).
//
// Landing screen for the admin section. Two outcomes:
//
//   1. The current user is signed in AND `isAdminProvider` returns
//      true → redirect straight to the dashboard (we never render
//      this screen for admins).
//
//   2. The current user is signed in as a regular user OR not signed
//      in at all → render a glass card explaining the access policy
//      and a copy-to-clipboard SQL hint from `docs/admin/playbook.md`
//      §1 ("Grant ADMIN to an existing user" one-liner).
//
// Honours `MediaQuery.of(context).disableAnimations` for the page-
// enter fade (brief §7). The page is otherwise static — no API
// calls. The "as admin" check is a derived provider; the server
// re-checks on every `/api/v1/admin/*` call.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_state.dart';
import '../../../core/theme/design_tokens.dart';
import '../../../shared/extensions/context.dart';
import '../application/admin_providers.dart';
import 'dashboard_page.dart';
import 'widgets/glass_card.dart';
import 'widgets/mesh_background.dart';

class AdminGatePage extends ConsumerStatefulWidget {
  const AdminGatePage({super.key});

  @override
  ConsumerState<AdminGatePage> createState() => _AdminGatePageState();
}

class _AdminGatePageState extends ConsumerState<AdminGatePage> {
  bool _entered = false;
  bool _copied = false;

  @override
  void initState() {
    super.initState();
    // If we're already an admin, bounce straight to the dashboard.
    // Otherwise we MUST flip `_entered` to true so the page becomes
    // visible (the build() wraps the body in AnimatedOpacity whose
    // opacity is driven by `_entered`; leaving it false would render
    // an invisible page for non-admin users).
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (ref.read(isAdminProvider)) {
        context.go(AdminDashboardPage.routePath);
        return;
      }
      setState(() => _entered = true);
    });
  }

  Future<void> _copySqlHint() async {
    await Clipboard.setData(const ClipboardData(
      text: 'UPDATE "User" SET role = \'ADMIN\' '
          'WHERE id = \'<paste-user-id-here>\';',
    ));
    if (!mounted) return;
    setState(() => _copied = true);
    Future<void>.delayed(const Duration(seconds: 2), () {
      if (mounted) setState(() => _copied = false);
    });
  }

  @override
  Widget build(BuildContext context) {
    final Brightness brightness = Theme.of(context).brightness;
    final AuthState auth = ref.watch(authStateProvider);
    final bool reduced =
        MediaQuery.of(context).disableAnimations;

    // Page-enter animation: opacity 0→1 + translateY 8→0 over 320ms
    // ease-out (brief §7). When `disableAnimations` is on we render
    // the final frame directly.
    return Scaffold(
      backgroundColor: brightness == Brightness.dark
          ? const Color(0xFF0B1020)
          : const Color(0xFFF6F8FB),
      body: MeshBackground(
        animated: !reduced,
        child: SafeArea(
          child: AnimatedOpacity(
            opacity: _entered ? 1.0 : 0.0,
            duration: const Duration(milliseconds: 320),
            curve: Curves.easeOut,
            onEnd: () {},
            child: AnimatedSlide(
              offset: _entered ? Offset.zero : const Offset(0, 0.025),
              duration: const Duration(milliseconds: 320),
              curve: Curves.easeOut,
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: DesignSpacing.xl,
                  vertical: DesignSpacing.xxl,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    const SizedBox(height: DesignSpacing.huge),
                    _Header(auth: auth),
                    const SizedBox(height: DesignSpacing.xxl),
                    GlassCard(
                      padding: const EdgeInsets.all(DesignSpacing.xl),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Text(
                            '需要管理员权限',
                            style: context.text.titleLarge,
                          ),
                          const SizedBox(height: DesignSpacing.sm),
                          Text(
                            '当前账号没有访问后台的权限。请联系现有管理员，将你的 User ID 升级为 ADMIN。复制下方的 SQL 一行命令，在数据库控制台执行即可。',
                            style: context.text.bodyMedium,
                          ),
                          const SizedBox(height: DesignSpacing.lg),
                          Glass(
                            size: GlassSize.sm,
                            padding: const EdgeInsets.all(DesignSpacing.md),
                            child: Row(
                              children: <Widget>[
                                Expanded(
                                  child: Text(
                                    "UPDATE \"User\" SET role = 'ADMIN' "
                                    "WHERE id = '<paste-user-id-here>';",
                                    style: const TextStyle(
                                      fontFamily: 'monospace',
                                      fontSize: 12,
                                      height: 1.4,
                                      color: DesignColors.onSurface,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: DesignSpacing.sm),
                                IconButton(
                                  tooltip: _copied ? '已复制' : '复制',
                                  icon: Icon(
                                    _copied
                                        ? Icons.check_rounded
                                        : Icons.copy_rounded,
                                    color: _copied
                                        ? DesignColors.success
                                        : DesignColors.onSurface,
                                  ),
                                  onPressed: _copySqlHint,
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: DesignSpacing.lg),
                          Text(
                            '你的 User ID：${auth.user?.id ?? '尚未登录'}',
                            style: context.text.bodySmall,
                          ),
                        ],
                      ),
                    ),
                    const Spacer(),
                    Center(
                      child: TextButton(
                        onPressed: () => context.pop(),
                        child: const Text('返回上一页'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.auth});
  final AuthState auth;

  @override
  Widget build(BuildContext context) {
    final String? nickname = auth.user?.nickname;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(
          'StudyBuddy',
          style: context.text.bodySmall?.copyWith(
            letterSpacing: 4,
            color: context.colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: DesignSpacing.sm),
        Text(
          '运营后台',
          style: context.text.displayMedium?.copyWith(
            fontSize: 40,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: DesignSpacing.xs),
        Text(
          nickname == null
              ? '请先登录后再访问。'
              : '欢迎回来，$nickname。这里是审核和管理控制台。',
          style: context.text.bodyLarge,
        ),
      ],
    );
  }
}
