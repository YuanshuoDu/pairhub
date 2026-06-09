// Users search — issue #32 frontend (Flutter half).
//
// Glass search field at the top, results below as a list of glass
// rows. Each row has a status pill (ACTIVE green / BANNED red) and a
// long-press menu to toggle the user's status. The search hits
// `GET /api/v1/admin/users` and the server enforces the
// "at least one filter" rule (see AdminApi / admin_providers).

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/design_tokens.dart';
import '../../../shared/extensions/context.dart';
import '../../../shared/widgets/empty_view.dart';
import '../../../shared/widgets/error_view.dart';
import '../../../shared/widgets/loading_view.dart';
import '../application/admin_providers.dart';
import '../data/admin_api.dart';
import 'widgets/glass_card.dart';
import 'widgets/mesh_background.dart';
import 'widgets/status_pill.dart';

class AdminUsersPage extends ConsumerStatefulWidget {
  const AdminUsersPage({super.key});

  static const String routePath = '/admin/users';

  @override
  ConsumerState<AdminUsersPage> createState() => _AdminUsersPageState();
}

class _AdminUsersPageState extends ConsumerState<AdminUsersPage> {
  final TextEditingController _searchController = TextEditingController();
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _searchController.dispose();
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scrollController.hasClients) return;
    final double max = _scrollController.position.maxScrollExtent;
    final double cur = _scrollController.position.pixels;
    if (max <= 0 || cur < max * 0.8) return;
    final AdminUsersListState? state =
        ref.read(adminUsersListProvider).value;
    if (state == null) return;
    if (!state.hasMore || state.isLoadingMore) return;
    ref.read(adminUsersListProvider.notifier).loadMore();
  }

  void _onSearchChanged(String value) {
    // Debounce: 300ms. We don't use a Timer here because the
    // search bar is debounced in the controller already (it watches
    // the TextEditingController's onChanged).
    ref.read(adminUsersQueryProvider.notifier).setSearch(
          value.trim().isEmpty ? null : value.trim(),
        );
  }

  @override
  Widget build(BuildContext context) {
    final AsyncValue<AdminUsersListState> async =
        ref.watch(adminUsersListProvider);
    final AdminUserListQuery query = ref.watch(adminUsersQueryProvider);
    final bool reduced = MediaQuery.of(context).disableAnimations;

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: MeshBackground(
        animated: !reduced,
        child: SafeArea(
          child: Column(
            children: <Widget>[
              _Header(
                total: async.value?.total ?? 0,
                query: query,
                searchController: _searchController,
                onSearchChanged: _onSearchChanged,
                onStatusChanged: (AdminUserStatus? s) =>
                    ref.read(adminUsersQueryProvider.notifier).setStatus(s),
              ),
              Expanded(
                child: RefreshIndicator(
                  onRefresh: () =>
                      ref.read(adminUsersListProvider.notifier).refresh(),
                  child: async.when(
                    loading: () => ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      children: const <Widget>[
                        SizedBox(height: 120),
                        LoadingView(label: '加载用户…'),
                      ],
                    ),
                    error: (Object e, _) => ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      children: <Widget>[
                        const SizedBox(height: 80),
                        ErrorView(
                          message: e is ApiException
                              ? e.message
                              : e.toString(),
                          onRetry: () => ref.invalidate(
                              adminUsersListProvider),
                        ),
                      ],
                    ),
                    data: (AdminUsersListState state) {
                      if (state.items.isEmpty) {
                        if (query.isEmpty) {
                          return ListView(
                            physics: const AlwaysScrollableScrollPhysics(),
                            children: const <Widget>[
                              SizedBox(height: 80),
                              EmptyView(
                                icon: Icons.search_outlined,
                                title: '输入搜索条件',
                                message: '至少需要提供 search / status / role '
                                    '之一才能查询',
                              ),
                            ],
                          );
                        }
                        return ListView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          children: const <Widget>[
                            SizedBox(height: 80),
                            EmptyView(
                              icon: Icons.person_off_outlined,
                              title: '没有匹配的用户',
                            ),
                          ],
                        );
                      }
                      return ListView.separated(
                        controller: _scrollController,
                        padding: const EdgeInsets.symmetric(
                          horizontal: DesignSpacing.lg,
                          vertical: DesignSpacing.md,
                        ),
                        itemCount: state.items.length,
                        separatorBuilder: (_, __) =>
                            const SizedBox(height: DesignSpacing.sm),
                        itemBuilder: (BuildContext context, int i) =>
                            _Row(user: state.items[i]),
                      );
                    },
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({
    required this.total,
    required this.query,
    required this.searchController,
    required this.onSearchChanged,
    required this.onStatusChanged,
  });

  final int total;
  final AdminUserListQuery query;
  final TextEditingController searchController;
  final ValueChanged<String> onSearchChanged;
  final ValueChanged<AdminUserStatus?> onStatusChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        DesignSpacing.lg,
        DesignSpacing.lg,
        DesignSpacing.lg,
        DesignSpacing.md,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              IconButton(
                icon: const Icon(Icons.arrow_back),
                color: DesignColors.onSurface,
                onPressed: () => context.pop(),
              ),
              const SizedBox(width: DesignSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text('用户管理', style: context.text.titleLarge),
                    Text(
                      query.isEmpty
                          ? '共 $total 条结果'
                          : '匹配 $total 条',
                      style: context.text.bodySmall,
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: DesignSpacing.md),
          _SearchField(
            controller: searchController,
            onChanged: onSearchChanged,
          ),
          const SizedBox(height: DesignSpacing.sm),
          _StatusFilterRow(current: query.status, onChanged: onStatusChanged),
        ],
      ),
    );
  }
}

class _SearchField extends StatelessWidget {
  const _SearchField({required this.controller, required this.onChanged});
  final TextEditingController controller;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Glass(
      size: GlassSize.sm,
      padding: const EdgeInsets.symmetric(
        horizontal: DesignSpacing.md,
        vertical: DesignSpacing.xs,
      ),
      child: Row(
        children: <Widget>[
          const Icon(
            Icons.search_rounded,
            size: 18,
            color: DesignColors.onSurfaceVariant,
          ),
          const SizedBox(width: DesignSpacing.sm),
          Expanded(
            child: TextField(
              controller: controller,
              onChanged: onChanged,
              textInputAction: TextInputAction.search,
              decoration: const InputDecoration(
                hintText: '昵称 / 手机号 / ID',
                border: InputBorder.none,
                isCollapsed: true,
                contentPadding: EdgeInsets.symmetric(vertical: 12),
              ),
              style: context.text.bodyMedium,
            ),
          ),
          if (controller.text.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.close_rounded, size: 18),
              color: DesignColors.onSurfaceVariant,
              tooltip: '清除',
              onPressed: () {
                controller.clear();
                onChanged('');
              },
            ),
        ],
      ),
    );
  }
}

class _StatusFilterRow extends StatelessWidget {
  const _StatusFilterRow({required this.current, required this.onChanged});
  final AdminUserStatus? current;
  final ValueChanged<AdminUserStatus?> onChanged;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 32,
      child: ListView(
        scrollDirection: Axis.horizontal,
        children: <Widget>[
          _StatusChip(
            label: '全部',
            active: current == null,
            onTap: () => onChanged(null),
          ),
          const SizedBox(width: DesignSpacing.sm),
          _StatusChip(
            label: '正常',
            active: current == AdminUserStatus.active,
            onTap: () => onChanged(
              current == AdminUserStatus.active ? null : AdminUserStatus.active,
            ),
          ),
          const SizedBox(width: DesignSpacing.sm),
          _StatusChip(
            label: '已封禁',
            active: current == AdminUserStatus.banned,
            onTap: () => onChanged(
              current == AdminUserStatus.banned ? null : AdminUserStatus.banned,
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({
    required this.label,
    required this.active,
    required this.onTap,
  });
  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Glass(
        size: GlassSize.sm,
        color: active ? DesignColors.onSurface.withOpacity(0.20) : null,
        padding: const EdgeInsets.symmetric(
          horizontal: DesignSpacing.md,
        ),
        child: Text(
          label,
          style: TextStyle(
            color: active ? DesignColors.onSurface : DesignColors.onSurfaceVariant,
            fontSize: 12,
            fontWeight: FontWeight.w500,
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

class _Row extends ConsumerWidget {
  const _Row({required this.user});
  final AdminUserRow user;

  Future<void> _toggleBan(BuildContext context, WidgetRef ref) async {
    HapticFeedback.mediumImpact();
    final bool banning = user.status != AdminUserStatus.banned;
    final AdminUserStatus next = banning
        ? AdminUserStatus.banned
        : AdminUserStatus.active;
    final ScaffoldMessengerState messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(adminUserStatusControllerProvider.notifier).setStatus(
            user.id,
            status: next,
            note: banning ? '操作员封禁' : '操作员解封',
          );
      messenger.showSnackBar(
        SnackBar(content: Text(banning ? '已封禁' : '已解封')),
      );
    } on Exception catch (e) {
      messenger.showSnackBar(SnackBar(
        content: Text(
          '操作失败：${e is ApiException ? e.message : e.toString()}',
        ),
      ));
    }
  }

  void _showActionSheet(BuildContext context, WidgetRef ref) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0x00000000),
      builder: (BuildContext ctx) => GlassSheet(
        padding: const EdgeInsets.all(DesignSpacing.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Text(user.nickname ?? '匿名', style: context.text.titleLarge),
            const SizedBox(height: DesignSpacing.sm),
            Text(user.id, style: context.text.bodySmall),
            const SizedBox(height: DesignSpacing.lg),
            if (user.status == AdminUserStatus.banned)
              ListTile(
                leading: const Icon(
                  Icons.lock_open_rounded,
                  color: DesignColors.success,
                ),
                title: const Text('解除封禁'),
                onTap: () {
                  Navigator.of(ctx).pop();
                  _toggleBan(context, ref);
                },
              )
            else
              ListTile(
                leading: const Icon(
                  Icons.block_rounded,
                  color: DesignColors.error,
                ),
                title: const Text('封禁此用户'),
                onTap: () {
                  Navigator.of(ctx).pop();
                  _toggleBan(context, ref);
                },
              ),
            ListTile(
              leading: const Icon(Icons.copy_rounded),
              title: const Text('复制用户 ID'),
              onTap: () {
                Clipboard.setData(ClipboardData(text: user.id));
                Navigator.of(ctx).pop();
                messenger(context, '已复制');
              },
            ),
          ],
        ),
      ),
    );
  }

  void messenger(BuildContext context, String text) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return GlassCard(
      padding: const EdgeInsets.all(DesignSpacing.lg),
      onTap: () => _showActionSheet(context, ref),
      child: Row(
        children: <Widget>[
          CircleAvatar(
            radius: 22,
            backgroundColor:
                DesignColors.primaryContainer.withOpacity(0.6),
            child: const Icon(
              Icons.person_outline,
              color: DesignColors.onSurface,
            ),
          ),
          const SizedBox(width: DesignSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  user.nickname ?? '匿名',
                  style: context.text.titleMedium,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Text(
                  <String>[
                    if (user.school != null && user.school!.isNotEmpty)
                      user.school!,
                    if (user.phone != null && user.phone!.isNotEmpty)
                      user.phone!,
                  ].join(' · '),
                  style: context.text.bodySmall,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          AdminUserStatusPill(status: _UserStatusAdapter(user.status)),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

class _UserStatusAdapter implements AdminUserStatusLike {
  _UserStatusAdapter(this.status);
  final AdminUserStatus status;
  @override
  String get label => status.label;
  @override
  StatusTone get tone => status == AdminUserStatus.banned
      ? StatusTone.error
      : StatusTone.success;
  @override
  IconData get icon => status == AdminUserStatus.banned
      ? Icons.block_rounded
      : Icons.check_circle_outline;
}
