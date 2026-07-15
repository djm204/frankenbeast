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
    const candidateItems = [...activeItems, candidate];
    const candidateAllocation = this.allocateReservations(candidateItems, candidateIndex);
    const candidateState = this.stateFromAllocation(candidateItems.length, candidateAllocation.buckets);
    const matchingReservationIndex = candidateAllocation.assignedBucketByItemIndex.get(candidateIndex);
    if (matchingReservationIndex !== undefined && this.normalWorkFits(candidateState)) {
      const reservation = this.reservations[matchingReservationIndex];
      if (reservation) {
        return { allowed: true, reason: 'reserved_capacity_available', reservationId: reservation.id };
      }
    }

    if (state.normalSlots.free > 0) {
      return { allowed: true, reason: 'normal_capacity_available', reservationId: undefined };
    }

    if (this.normalWorkFits(candidateState)) {
      return { allowed: true, reason: 'released_reserved_capacity_available', reservationId: undefined };
    }

    return { allowed: false, reason: 'reserved_capacity_only', reservationId: undefined };
  }

  describe(activeItems: readonly CapacityReservationWorkItem[]): CapacityReservationState {
    const { buckets } = this.allocateReservations(activeItems);

    return this.stateFromAllocation(activeItems.length, buckets);
  }

  private stateFromAllocation(
    usedSlots: number,
    buckets: Array<{
      id: string;
      slots: number;
      used: number;
      released: boolean;
      labels: string[];
      categories: string[];
    }>,
  ): CapacityReservationState {

    const matchingBuckets = buckets.map((bucket) => ({
      ...bucket,
      free: Math.max(0, bucket.slots - bucket.used),
    }));
    const totalReservedSlots = matchingBuckets.reduce((sum, bucket) => sum + bucket.slots, 0);
    const matchingReservedUsed = matchingBuckets.reduce((sum, bucket) => sum + bucket.used, 0);
    const normalTotal = this.totalSlots - totalReservedSlots;
    const normalUsed = Math.max(0, usedSlots - matchingReservedUsed);
    let releasedOverflowUsed = Math.max(0, normalUsed - normalTotal);
    const bucketsWithFree = matchingBuckets.map((bucket) => {
      const overflowUsed = bucket.released ? Math.min(bucket.free, releasedOverflowUsed) : 0;
      releasedOverflowUsed -= overflowUsed;
      const used = bucket.used + overflowUsed;
      return {
        ...bucket,
        used,
        free: Math.max(0, bucket.slots - used),
      };
    });

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

  private normalWorkFits(state: CapacityReservationState): boolean {
    const reservedUsed = state.reservations.reduce((sum, bucket) => sum + bucket.used, 0);
    const normalOverflowUsed = Math.max(0, state.usedSlots - reservedUsed - state.normalSlots.total);
    const releasedFree = state.reservations
      .filter((reservation) => reservation.released)
      .reduce((sum, reservation) => sum + reservation.free, 0);
    return normalOverflowUsed <= releasedFree;
  }

  private allocateReservations(
    activeItems: readonly CapacityReservationWorkItem[],
    priorityItemIndex?: number,
  ): {
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
    const bucketSlots = buckets.flatMap((bucket, bucketIndex) => (
      Array.from({ length: bucket.slots }, () => bucketIndex)
    ));
    const assignedSlotByItemIndex = new Map<number, number>();
    const assignedItemBySlotIndex = new Map<number, number>();
    const indexedActiveItems = activeItems
      .map((item, activeIndex) => ({
        activeIndex,
        matchingSlotIndexes: bucketSlots.flatMap((bucketIndex, slotIndex) => {
          const reservation = this.reservations[bucketIndex];
          if (!reservation) return [];
          return this.matches(reservation, item) ? [slotIndex] : [];
        }).sort((leftSlotIndex, rightSlotIndex) => {
          const leftBucketIndex = bucketSlots[leftSlotIndex];
          const rightBucketIndex = bucketSlots[rightSlotIndex];
          const leftReleased = leftBucketIndex !== undefined && buckets[leftBucketIndex]?.released === true;
          const rightReleased = rightBucketIndex !== undefined && buckets[rightBucketIndex]?.released === true;
          if (leftReleased !== rightReleased) {
            return leftReleased ? 1 : -1;
          }
          return leftSlotIndex - rightSlotIndex;
        }),
      }))
      .filter(({ matchingSlotIndexes }) => matchingSlotIndexes.length > 0)
      .sort((left, right) => {
        if (priorityItemIndex !== undefined && left.activeIndex !== right.activeIndex) {
          if (left.activeIndex === priorityItemIndex) return -1;
          if (right.activeIndex === priorityItemIndex) return 1;
        }
        if (left.matchingSlotIndexes.length !== right.matchingSlotIndexes.length) {
          return left.matchingSlotIndexes.length - right.matchingSlotIndexes.length;
        }
        return left.activeIndex - right.activeIndex;
      });

    const tryAssign = (activeIndex: number, matchingSlotIndexes: readonly number[], seenSlots: Set<number>): boolean => {
      for (const slotIndex of matchingSlotIndexes) {
        if (seenSlots.has(slotIndex)) continue;
        if (!assignedItemBySlotIndex.has(slotIndex)) {
          assignedItemBySlotIndex.set(slotIndex, activeIndex);
          assignedSlotByItemIndex.set(activeIndex, slotIndex);
          return true;
        }
      }

      for (const slotIndex of matchingSlotIndexes) {
        if (seenSlots.has(slotIndex)) continue;
        seenSlots.add(slotIndex);
        const displacedItemIndex = assignedItemBySlotIndex.get(slotIndex);
        if (displacedItemIndex === undefined) continue;
        const displacedItem = indexedActiveItems.find((item) => item.activeIndex === displacedItemIndex);
        if (displacedItem && tryAssign(displacedItemIndex, displacedItem.matchingSlotIndexes, seenSlots)) {
          assignedItemBySlotIndex.set(slotIndex, activeIndex);
          assignedSlotByItemIndex.set(activeIndex, slotIndex);
          return true;
        }
      }
      return false;
    };

    for (const { activeIndex, matchingSlotIndexes } of indexedActiveItems) {
      tryAssign(activeIndex, matchingSlotIndexes, new Set<number>());
    }

    const assignedBucketByItemIndex = new Map<number, number>();
    for (const [activeIndex, slotIndex] of assignedSlotByItemIndex.entries()) {
      const bucketIndex = bucketSlots[slotIndex];
      if (bucketIndex === undefined) continue;
      const bucket = buckets[bucketIndex];
      if (bucket) {
        bucket.used += 1;
        assignedBucketByItemIndex.set(activeIndex, bucketIndex);
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
