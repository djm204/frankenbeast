export interface CapacityReservationRule {
  readonly id: string;
  readonly slots: number;
  readonly labels?: readonly string[] | undefined;
  readonly categories?: readonly string[] | undefined;
}

export interface CapacityReservationPolicyConfig {
  readonly totalSlots: number;
  readonly reservations: readonly CapacityReservationRule[];
  readonly releasedReservationIds?: readonly string[] | undefined;
}

export interface CapacityReservationWorkItem {
  readonly id: string;
  readonly labels?: readonly string[] | undefined;
  readonly category?: string | undefined;
  readonly categories?: readonly string[] | undefined;
}

export interface CapacityReservationDecision {
  readonly allowed: boolean;
  readonly reason:
    | 'normal_capacity_available'
    | 'reserved_capacity_available'
    | 'released_reserved_capacity_available'
    | 'reserved_capacity_only'
    | 'capacity_full';
  readonly reservationId?: string | undefined;
}

export interface CapacityReservationState {
  readonly totalSlots: number;
  readonly usedSlots: number;
  readonly freeSlots: number;
  readonly normalSlots: {
    readonly total: number;
    readonly used: number;
    readonly free: number;
  };
  readonly reservations: readonly CapacityReservationBucketState[];
}

export interface CapacityReservationBucketState {
  readonly id: string;
  readonly slots: number;
  readonly used: number;
  readonly free: number;
  readonly released: boolean;
  readonly labels: readonly string[];
  readonly categories: readonly string[];
}

export class CapacityReservationError extends Error {
  constructor(
    public readonly decision: CapacityReservationDecision,
    public readonly state: CapacityReservationState,
  ) {
    super('Agent capacity is reserved for urgent matching work');
    this.name = 'CapacityReservationError';
  }
}

export class CapacityReservationPolicy {
  private readonly releasedReservationIds: ReadonlySet<string>;
  private readonly reservations: readonly CapacityReservationRule[];
  readonly totalSlots: number;

  constructor(config: CapacityReservationPolicyConfig) {
    if (!Number.isSafeInteger(config.totalSlots) || config.totalSlots < 1) {
      throw new RangeError(`capacity totalSlots must be a positive safe integer, received ${config.totalSlots}`);
    }
    const seen = new Set<string>();
    let reservedSlots = 0;
    this.reservations = config.reservations.map((reservation) => {
      if (!reservation.id.trim()) {
        throw new RangeError('capacity reservation id must be non-empty');
      }
      if (seen.has(reservation.id)) {
        throw new RangeError(`duplicate capacity reservation id: ${reservation.id}`);
      }
      seen.add(reservation.id);
      if (!Number.isSafeInteger(reservation.slots) || reservation.slots < 1) {
        throw new RangeError(`capacity reservation '${reservation.id}' slots must be a positive safe integer`);
      }
      reservedSlots += reservation.slots;
      const labels = normalizeMatchers(reservation.labels);
      const categories = normalizeMatchers(reservation.categories);
      if (labels.length === 0 && categories.length === 0) {
        throw new RangeError(`capacity reservation '${reservation.id}' must match at least one label or category`);
      }
      return { ...reservation, labels, categories };
    });
    if (reservedSlots > config.totalSlots) {
      throw new RangeError(`reserved capacity (${reservedSlots}) exceeds total capacity (${config.totalSlots})`);
    }
    this.totalSlots = config.totalSlots;
    this.releasedReservationIds = new Set(config.releasedReservationIds ?? []);
  }

  canStart(candidate: CapacityReservationWorkItem, activeItems: readonly CapacityReservationWorkItem[]): CapacityReservationDecision {
    const state = this.describe(activeItems);
    if (state.freeSlots <= 0) {
      return { allowed: false, reason: 'capacity_full', reservationId: undefined };
    }

    const candidateIndex = activeItems.length;
    const candidateAllocation = this.allocateReservations([...activeItems, candidate]);
    const matchingReservationIndex = candidateAllocation.assignedBucketByItemIndex.get(candidateIndex);
    if (matchingReservationIndex !== undefined) {
      const reservation = this.reservations[matchingReservationIndex];
      if (reservation) {
        return { allowed: true, reason: 'reserved_capacity_available', reservationId: reservation.id };
      }
    }

    if (state.normalSlots.free > 0) {
      return { allowed: true, reason: 'normal_capacity_available', reservationId: undefined };
    }

    if (this.releasedReservationFreeForNormalWork(state, activeItems) > 0) {
      return { allowed: true, reason: 'released_reserved_capacity_available', reservationId: undefined };
    }

    return { allowed: false, reason: 'reserved_capacity_only', reservationId: undefined };
  }

  describe(activeItems: readonly CapacityReservationWorkItem[]): CapacityReservationState {
    const usedSlots = activeItems.length;
    const { buckets } = this.allocateReservations(activeItems);

    const bucketsWithFree = buckets.map((bucket) => ({
      ...bucket,
      free: Math.max(0, bucket.slots - bucket.used),
    }));
    const totalReservedSlots = bucketsWithFree.reduce((sum, bucket) => sum + bucket.slots, 0);
    const reservedUsed = bucketsWithFree.reduce((sum, bucket) => sum + bucket.used, 0);
    const normalTotal = this.totalSlots - totalReservedSlots;
    const normalUsed = Math.max(0, usedSlots - reservedUsed);

    return {
      totalSlots: this.totalSlots,
      usedSlots,
      freeSlots: Math.max(0, this.totalSlots - usedSlots),
      normalSlots: {
        total: normalTotal,
        used: Math.min(normalUsed, normalTotal),
        free: Math.max(0, normalTotal - normalUsed),
      },
      reservations: bucketsWithFree,
    };
  }

  private releasedReservationFreeForNormalWork(
    state: CapacityReservationState,
    activeItems: readonly CapacityReservationWorkItem[],
  ): number {
    const reservedUsed = state.reservations.reduce((sum, bucket) => sum + bucket.used, 0);
    const normalOverflowUsed = Math.max(0, activeItems.length - reservedUsed - state.normalSlots.total);
    const releasedFree = state.reservations
      .filter((reservation) => reservation.released)
      .reduce((sum, reservation) => sum + reservation.free, 0);
    return Math.max(0, releasedFree - normalOverflowUsed);
  }

  private allocateReservations(activeItems: readonly CapacityReservationWorkItem[]): {
    buckets: Array<{
      id: string;
      slots: number;
      used: number;
      released: boolean;
      labels: string[];
      categories: string[];
    }>;
    assignedBucketByItemIndex: Map<number, number>;
  } {
    const buckets = this.reservations.map((reservation) => ({
      id: reservation.id,
      slots: reservation.slots,
      used: 0,
      released: this.releasedReservationIds.has(reservation.id),
      labels: [...(reservation.labels ?? [])],
      categories: [...(reservation.categories ?? [])],
    }));
    const assignedBucketByItemIndex = new Map<number, number>();
    const indexedActiveItems = activeItems
      .map((item, activeIndex) => ({
        activeIndex,
        matchingIndexes: this.matchingReservationIndexes(item),
      }))
      .filter(({ matchingIndexes }) => matchingIndexes.length > 0)
      .sort((left, right) => {
        if (left.matchingIndexes.length !== right.matchingIndexes.length) {
          return left.matchingIndexes.length - right.matchingIndexes.length;
        }
        return left.activeIndex - right.activeIndex;
      });

    for (const { activeIndex, matchingIndexes } of indexedActiveItems) {
      const bucketIndex = matchingIndexes.find((index) => {
        const bucket = buckets[index];
        return bucket !== undefined && bucket.used < bucket.slots;
      });
      if (bucketIndex !== undefined) {
        const bucket = buckets[bucketIndex];
        if (bucket) {
          bucket.used += 1;
          assignedBucketByItemIndex.set(activeIndex, bucketIndex);
        }
      }
    }
    return { buckets, assignedBucketByItemIndex };
  }

  private matchingReservationIndexes(item: CapacityReservationWorkItem): number[] {
    return this.reservations.flatMap((reservation, index) => (
      this.matches(reservation, item) ? [index] : []
    ));
  }

  private matches(reservation: CapacityReservationRule, item: CapacityReservationWorkItem): boolean {
    const labels = new Set((item.labels ?? []).map(normalizeMatcher));
    const categories = new Set([...(item.categories ?? []), item.category].filter(isString).map(normalizeMatcher));
    return (reservation.labels ?? []).some((label) => labels.has(label))
      || (reservation.categories ?? []).some((category) => categories.has(category));
  }
}

export function capacityItemFromConfig(
  id: string,
  initConfig: Readonly<Record<string, unknown>>,
): CapacityReservationWorkItem {
  const issue = isRecord(initConfig.issue) ? initConfig.issue : undefined;
  return {
    id,
    labels: [
      ...stringsFromUnknown(initConfig.labels),
      ...stringsFromUnknown(initConfig.label),
      ...stringsFromUnknown(initConfig.issueLabels),
      ...stringsFromUnknown(issue?.labels),
    ],
    categories: [
      ...stringsFromUnknown(initConfig.categories),
      ...stringsFromUnknown(initConfig.category),
      ...stringsFromUnknown(issue?.category),
    ],
  };
}

function normalizeMatchers(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map(normalizeMatcher).filter(Boolean))];
}

function normalizeMatcher(value: string): string {
  return value.trim().toLowerCase();
}

function stringsFromUnknown(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string');
  }
  return [];
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
