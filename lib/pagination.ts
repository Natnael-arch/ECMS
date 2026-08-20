type CursorPaginationArgs = {
  cursor?: string;
  limit?: number;
  orderBy?: Record<string, 'asc' | 'desc'>;
};

export function getCursorPaginationArgs(args: CursorPaginationArgs) {
  const limit = Math.min(args.limit ?? 25, 100);
  const orderBy = args.orderBy ?? { created_at: 'desc' };

  return {
    take: limit + 1,
    ...(args.cursor ? { cursor: { id: args.cursor }, skip: 1 } : {}),
    orderBy,
  };
}

export function paginateResult<T extends { id: string }>(items: T[], limit: number) {
  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  return {
    data,
    pagination: {
      nextCursor,
      hasMore,
      limit,
    },
  };
}
