"use client";

import {
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { AppShell } from "../AppShell";
import {
  AlertHistoryDetailDrawer,
} from "./AlertHistoryDetailDrawer";
import {
  AlertHistoryDayGroupList,
} from "./AlertHistoryDayGroup";
import {
  AlertHistoryFilters,
  type DatePreset,
} from "./AlertHistoryFilters";
import { AlertHistoryHeader } from "./AlertHistoryHeader";
import { AlertHistorySummary } from "./AlertHistorySummary";
import {
  DEFAULT_USER_ID,
} from "../../lib/riskhub-api";
import {
  fetchAlertHistory,
  markAlertRead,
  markFilteredAlertsRead,
  type AlertHistoryAlert,
  type AlertHistoryResponse,
  type AlertReadStatus,
} from "../../lib/alertHistory";

interface FilterState {
  fromDate: string;
  toDate: string;
  datePreset: DatePreset;
  severity: string;
  category: string;
  ruleId: string;
  readStatus: AlertReadStatus;
  exchangeId: string;
  search: string;
}

const PAGE_SIZE = 50;

function toDateInputValue(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function presetRange(preset: DatePreset): { fromDate: string; toDate: string } {
  const today = new Date();
  const toDate = toDateInputValue(today);
  const from = new Date(today);

  if (preset === "today") {
    return { fromDate: toDate, toDate };
  }
  if (preset === "yesterday") {
    from.setDate(today.getDate() - 1);
    const dayValue = toDateInputValue(from);
    return { fromDate: dayValue, toDate: dayValue };
  }
  if (preset === "last30") {
    from.setDate(today.getDate() - 29);
    return { fromDate: toDateInputValue(from), toDate };
  }

  from.setDate(today.getDate() - 6);
  return { fromDate: toDateInputValue(from), toDate };
}

function initialFilters(): FilterState {
  const { fromDate, toDate } = presetRange("last7");
  return {
    fromDate,
    toDate,
    datePreset: "last7",
    severity: "",
    category: "",
    ruleId: "",
    readStatus: "all",
    exchangeId: "",
    search: "",
  };
}

function findAlertById(payload: AlertHistoryResponse, alertId: string): AlertHistoryAlert | null {
  for (const group of payload.groups) {
    const match = group.alerts.find((alert) => alert.id === alertId);
    if (match) {
      return match;
    }
  }
  return null;
}

function markAlertReadInPayload(
  payload: AlertHistoryResponse,
  alertId: string,
  readAt: string,
): AlertHistoryResponse {
  let hasChanges = false;
  const nextGroups = payload.groups.map((group) => {
    const nextAlerts = group.alerts.map((alert) => {
      if (alert.id !== alertId || alert.is_read) {
        return alert;
      }
      hasChanges = true;
      return {
        ...alert,
        is_read: true,
        read_at: readAt,
      };
    });
    return { ...group, alerts: nextAlerts };
  });

  if (!hasChanges) {
    return payload;
  }

  return {
    ...payload,
    groups: nextGroups,
    summary: {
      ...payload.summary,
      unread: Math.max(0, payload.summary.unread - 1),
    },
  };
}

export function AlertHistoryScreen() {
  const userId = DEFAULT_USER_ID;
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [page, setPage] = useState(1);
  const [reloadToken, setReloadToken] = useState(0);
  const [payload, setPayload] = useState<AlertHistoryResponse | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<AlertHistoryAlert | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);
  const [isMarkingSingleRead, setIsMarkingSingleRead] = useState(false);
  const hasLoadedOnceRef = useRef(false);

  const deferredSearch = useDeferredValue(filters.search);

  useEffect(() => {
    const controller = new AbortController();
    const firstLoad = !hasLoadedOnceRef.current;
    if (firstLoad) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    void fetchAlertHistory(
      userId,
      {
        fromDate: filters.fromDate,
        toDate: filters.toDate,
        severity: filters.severity || null,
        category: filters.category || null,
        ruleId: filters.ruleId || null,
        readStatus: filters.readStatus,
        exchangeId: filters.exchangeId || null,
        search: deferredSearch,
        page,
        pageSize: PAGE_SIZE,
      },
      controller.signal,
    )
      .then((nextPayload) => {
        hasLoadedOnceRef.current = true;
        startTransition(() => {
          setPayload(nextPayload);
          setErrorMessage(null);
          setSelectedAlert((current) => {
            if (!current) {
              return null;
            }
            return findAlertById(nextPayload, current.id);
          });
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        const message =
          error instanceof Error
            ? error.message
            : "Alert history is unavailable right now.";
        hasLoadedOnceRef.current = true;
        startTransition(() => {
          setErrorMessage(message);
          setPayload(null);
          setSelectedAlert(null);
        });
      })
      .finally(() => {
        if (controller.signal.aborted) {
          return;
        }
        setIsLoading(false);
        setIsRefreshing(false);
      });

    return () => {
      controller.abort();
    };
  }, [
    deferredSearch,
    filters.category,
    filters.exchangeId,
    filters.fromDate,
    filters.readStatus,
    filters.ruleId,
    filters.severity,
    filters.toDate,
    page,
    reloadToken,
    userId,
  ]);

  const applyPreset = (preset: DatePreset) => {
    const range = presetRange(preset);
    startTransition(() => {
      setFilters((current) => ({
        ...current,
        fromDate: range.fromDate,
        toDate: range.toDate,
        datePreset: preset,
      }));
      setPage(1);
    });
  };

  const updateDateFrom = (value: string) => {
    startTransition(() => {
      setFilters((current) => ({ ...current, fromDate: value, datePreset: "custom" }));
      setPage(1);
    });
  };

  const updateDateTo = (value: string) => {
    startTransition(() => {
      setFilters((current) => ({ ...current, toDate: value, datePreset: "custom" }));
      setPage(1);
    });
  };

  const resetFilters = () => {
    startTransition(() => {
      setFilters(initialFilters());
      setPage(1);
    });
  };

  const refreshHistory = () => {
    setReloadToken((current) => current + 1);
  };

  const handleMarkAllRead = async () => {
    setIsMarkingAllRead(true);
    try {
      const response = await markFilteredAlertsRead(userId, {
        fromDate: filters.fromDate,
        toDate: filters.toDate,
        severity: filters.severity || null,
        category: filters.category || null,
        ruleId: filters.ruleId || null,
        readStatus: filters.readStatus,
        exchangeId: filters.exchangeId || null,
        search: filters.search,
      });
      toast.success(
        response.marked_read > 0
          ? `Marked ${response.marked_read} alert${response.marked_read === 1 ? "" : "s"} in the current view as read.`
          : "No unread alerts were found.",
      );
      refreshHistory();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to mark alerts as read.";
      toast.error(message);
    } finally {
      setIsMarkingAllRead(false);
    }
  };

  const handleMarkSingleRead = async (alertId: string) => {
    setIsMarkingSingleRead(true);
    try {
      const response = await markAlertRead(userId, alertId);
      const readAt = response.read_at ?? new Date().toISOString();

      startTransition(() => {
        setPayload((current) =>
          current ? markAlertReadInPayload(current, alertId, readAt) : current,
        );
        setSelectedAlert((current) =>
          current && current.id === alertId
            ? {
                ...current,
                is_read: true,
                read_at: readAt,
              }
            : current,
        );
      });

      if (response.already_read) {
        toast.message("This alert was already marked as read.");
      } else {
        toast.success("Alert marked as read.");
      }

      if (filters.readStatus === "unread") {
        setSelectedAlert(null);
        refreshHistory();
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to mark alert as read.";
      toast.error(message);
    } finally {
      setIsMarkingSingleRead(false);
    }
  };

  const showNoAlertsYet = Boolean(
    payload && payload.summary.total_all === 0 && !isLoading && !errorMessage,
  );
  const showNoFilteredResults = Boolean(
    payload &&
      payload.summary.total_all > 0 &&
      payload.pagination.total === 0 &&
      !isLoading &&
      !errorMessage,
  );

  return (
    <AppShell
      header={(
        <header className="sticky top-0 z-30 flex min-h-20 items-center border-b border-white/6 bg-main-bg/90 px-5 py-4 backdrop-blur-xl md:px-8">
          <div className="flex flex-col">
            <span className="text-sm font-semibold uppercase tracking-[0.18em] text-text-secondary">
              RiskHub Archive
            </span>
            <span className="text-base font-semibold text-text-primary">Alert History</span>
          </div>
        </header>
      )}
      mainClassName="p-4 md:p-5 lg:p-6"
    >
      <div className="mx-auto flex w-full max-w-[1380px] flex-col gap-4">
        <AlertHistoryHeader
          totalFiltered={payload?.summary.total_filtered ?? 0}
          unreadCount={payload?.summary.unread ?? 0}
          isRefreshing={isRefreshing}
          isMarkingAllRead={isMarkingAllRead}
          onRefresh={refreshHistory}
          onMarkAllRead={() => {
            void handleMarkAllRead();
          }}
        />

        {payload ? (
          <AlertHistorySummary
            unread={payload.summary.unread}
            critical={payload.summary.critical}
            warning={payload.summary.warning}
            last7Days={payload.summary.last_7_days}
          />
        ) : null}

        <AlertHistoryFilters
          fromDate={filters.fromDate}
          toDate={filters.toDate}
          datePreset={filters.datePreset}
          severity={filters.severity}
          category={filters.category}
          ruleId={filters.ruleId}
          readStatus={filters.readStatus}
          exchangeId={filters.exchangeId}
          search={filters.search}
          severityOptions={payload?.filters_available.severity ?? []}
          categoryOptions={payload?.filters_available.category ?? []}
          ruleOptions={payload?.filters_available.rules ?? []}
          exchangeOptions={payload?.filters_available.exchanges ?? []}
          onDatePresetChange={applyPreset}
          onFromDateChange={updateDateFrom}
          onToDateChange={updateDateTo}
          onSeverityChange={(value) => {
            startTransition(() => {
              setFilters((current) => ({ ...current, severity: value }));
              setPage(1);
            });
          }}
          onCategoryChange={(value) => {
            startTransition(() => {
              setFilters((current) => ({ ...current, category: value }));
              setPage(1);
            });
          }}
          onRuleChange={(value) => {
            startTransition(() => {
              setFilters((current) => ({ ...current, ruleId: value }));
              setPage(1);
            });
          }}
          onReadStatusChange={(value) => {
            startTransition(() => {
              setFilters((current) => ({ ...current, readStatus: value }));
              setPage(1);
            });
          }}
          onExchangeChange={(value) => {
            startTransition(() => {
              setFilters((current) => ({ ...current, exchangeId: value }));
              setPage(1);
            });
          }}
          onSearchChange={(value) => {
            startTransition(() => {
              setFilters((current) => ({ ...current, search: value }));
              setPage(1);
            });
          }}
          onReset={resetFilters}
        />

        {isLoading ? (
          <section className="rounded-2xl border border-white/8 bg-surface-high/55 px-4 py-10 text-center text-sm text-text-secondary">
            Loading alert history...
          </section>
        ) : null}

        {errorMessage ? (
          <section className="rounded-2xl border border-danger/35 bg-danger/10 px-4 py-4 text-sm text-danger">
            {errorMessage}
          </section>
        ) : null}

        {payload?.warnings?.length ? (
          <section className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
            {payload.warnings[0]}
          </section>
        ) : null}

        {showNoAlertsYet ? (
          <section className="rounded-2xl border border-white/8 bg-surface-high/55 px-4 py-10 text-center text-sm text-text-secondary">
            No archived alerts yet.
          </section>
        ) : null}

        {showNoFilteredResults ? (
          <section className="rounded-2xl border border-white/8 bg-surface-high/55 px-4 py-10 text-center text-sm text-text-secondary">
            No alerts match the current filters.
          </section>
        ) : null}

        {payload && payload.pagination.total > 0 && !errorMessage ? (
          <>
            <AlertHistoryDayGroupList
              groups={payload.groups}
              selectedAlertId={selectedAlert?.id ?? null}
              onSelectAlert={setSelectedAlert}
            />

            {payload.pagination.total_pages > 1 ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/8 bg-surface-high/55 px-4 py-3 text-sm text-text-secondary">
                <span>
                  Page {payload.pagination.page} of {payload.pagination.total_pages}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!payload.pagination.has_previous}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Newer
                  </button>
                  <button
                    type="button"
                    disabled={!payload.pagination.has_next}
                    onClick={() => setPage((current) => current + 1)}
                    className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Older
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <AlertHistoryDetailDrawer
        userId={userId}
        alert={selectedAlert}
        isMarkingRead={isMarkingSingleRead}
        onClose={() => setSelectedAlert(null)}
        onMarkRead={handleMarkSingleRead}
      />
    </AppShell>
  );
}
