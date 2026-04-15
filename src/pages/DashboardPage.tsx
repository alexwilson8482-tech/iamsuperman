import { useState, useMemo } from "react";
import type { CreatedOrder } from "../types/order";

interface DashboardPageProps {
  orders: CreatedOrder[];
}

type TimePeriod = "today" | "week" | "month" | "all";

export function DashboardPage({ orders }: DashboardPageProps) {
  const [period, setPeriod] = useState<TimePeriod>("all");
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // 🔥 FIX: Use backend status directly instead of guessing from time
  function getRealStatus(order: CreatedOrder): string {
    if (order.status === "cancelled") return "cancelled";
    if (order.status === "failed") return "failed";
    if (order.status === "completed") return "completed";
    if (order.status === "paused") return "paused";

    const runs = order.runs || [];
    const now = Date.now();

    if (runs.length > 0) {
      const allFuture = runs.every((run) => {
        const runTime = run?.at instanceof Date ? run.at.getTime() : new Date(run?.at ?? now).getTime();
        return runTime > now;
      });
      if (allFuture) return "scheduled";
    }

    if (order.status === "processing" || order.status === "running") return "running";

    return order.status || "running";
  }

  const filteredOrders = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date(todayStart);
    monthStart.setDate(monthStart.getDate() - 30);

    return orders.filter((order) => {
      const orderDate = new Date(order.createdAt);
      if (period === "today") return orderDate >= todayStart;
      if (period === "week") return orderDate >= weekStart;
      if (period === "month") return orderDate >= monthStart;
      return true;
    });
  }, [orders, period]);

  const stats = useMemo(() => {
    const total = filteredOrders.length;

    const running = filteredOrders.filter((o) => {
      const s = getRealStatus(o);
      return s === "running" || s === "processing" || s === "paused";
    }).length;

    const completed = filteredOrders.filter((o) => getRealStatus(o) === "completed").length;
    const failed = filteredOrders.filter((o) => {
      const s = getRealStatus(o);
      return s === "failed" || s === "cancelled";
    }).length;
    const scheduled = filteredOrders.filter((o) => getRealStatus(o) === "scheduled").length;
    const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { total, running, completed, failed, scheduled, successRate };
  }, [filteredOrders]);

  // 🔥 FIX: Services breakdown now uses totalViews + engagement for backend-loaded orders
  const servicesBreakdown = useMemo(() => {
    let views = 0;
    let likes = 0;
    let shares = 0;
    let saves = 0;
    let comments = 0;

    filteredOrders.forEach((order) => {
      const runViews = (order.runs || []).reduce((sum, run) => sum + (run.views || 0), 0);
      const runLikes = (order.runs || []).reduce((sum, run) => sum + (run.likes || 0), 0);
      const runShares = (order.runs || []).reduce((sum, run) => sum + (run.shares || 0), 0);
      const runSaves = (order.runs || []).reduce((sum, run) => sum + (run.saves || 0), 0);
      const runComments = (order.runs || []).reduce((sum, run) => sum + (run.comments || 0), 0);

      // 🔥 FIX: If runs have 0 views (backend-loaded), fall back to order-level data
      views += runViews > 0 ? runViews : (order.totalViews || 0);
      likes += runLikes > 0 ? runLikes : (order.engagement?.likes || 0);
      shares += runShares > 0 ? runShares : (order.engagement?.shares || 0);
      saves += runSaves > 0 ? runSaves : (order.engagement?.saves || 0);
      comments += runComments > 0 ? runComments : (order.engagement?.comments || 0);
    });

    const total = views + likes + shares + saves + comments;
    return {
      views: { count: views, percent: total > 0 ? Math.round((views / total) * 100) : 0 },
      likes: { count: likes, percent: total > 0 ? Math.round((likes / total) * 100) : 0 },
      shares: { count: shares, percent: total > 0 ? Math.round((shares / total) * 100) : 0 },
      saves: { count: saves, percent: total > 0 ? Math.round((saves / total) * 100) : 0 },
      comments: { count: comments, percent: total > 0 ? Math.round((comments / total) * 100) : 0 },
      total,
    };
  }, [filteredOrders]);

  const chartData = useMemo(() => {
    const days: { label: string; count: number; date: Date }[] = [];
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const count = orders.filter((order) => {
        const orderDate = new Date(order.createdAt);
        return orderDate >= dayStart && orderDate < dayEnd;
      }).length;

      days.push({
        label: date.toLocaleDateString("en", { weekday: "short" }),
        count,
        date: dayStart,
      });
    }

    const maxCount = Math.max(...days.map((d) => d.count), 1);
    return { days, maxCount };
  }, [orders]);

  const recentOrders = useMemo(() => {
    return [...orders]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  }, [orders]);

  const getStatusColor = (order: CreatedOrder) => {
    const status = getRealStatus(order);
    switch (status) {
      case "running": case "processing": return "text-yellow-400";
      case "completed": return "text-emerald-400";
      case "paused": return "text-orange-400";
      case "scheduled": return "text-blue-400";
      case "failed": case "cancelled": return "text-red-400";
      default: return "text-gray-400";
    }
  };

  const getStatusBg = (order: CreatedOrder) => {
    const status = getRealStatus(order);
    switch (status) {
      case "running": case "processing": return "bg-yellow-500/20";
      case "completed": return "bg-emerald-500/20";
      case "paused": return "bg-orange-500/20";
      case "scheduled": return "bg-blue-500/20";
      case "failed": case "cancelled": return "bg-red-500/20";
      default: return "bg-gray-500/20";
    }
  };

  const getStatusIcon = (order: CreatedOrder) => {
    const status = getRealStatus(order);
    switch (status) {
      case "running": case "processing": return "⚡";
      case "completed": return "✅";
      case "paused": return "⏸️";
      case "scheduled": return "📅";
      case "failed": case "cancelled": return "❌";
      default: return "📦";
    }
  };

  const handleClearOrders = () => {
    localStorage.removeItem("dev-smm-orders");
    window.location.reload();
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-7">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">🦇</span>
            <h2 className="text-2xl font-bold tracking-tight text-yellow-400">Gotham Command</h2>
          </div>
          <p className="mt-1 text-sm text-gray-500">Monitoring all operations across the city</p>
        </div>

        <div className="inline-flex rounded-lg border border-yellow-500/30 bg-black p-1">
          {[
            { key: "today", label: "Today" },
            { key: "week", label: "7 Days" },
            { key: "month", label: "30 Days" },
            { key: "all", label: "All Time" },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setPeriod(item.key as TimePeriod)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                period === item.key ? "bg-yellow-500/20 text-yellow-400" : "text-gray-500 hover:text-yellow-300"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-yellow-500/20 bg-gradient-to-br from-gray-900 to-black p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total Missions</p>
            <span className="text-xl">📦</span>
          </div>
          <p className="mt-3 text-3xl font-bold text-white">{stats.total}</p>
          <p className="mt-1 text-xs text-gray-600">
            {period === "today" ? "Deployed today" : period === "week" ? "Last 7 nights" : period === "month" ? "Last 30 nights" : "All time"}
          </p>
        </div>

        <div className="rounded-xl border border-yellow-500/30 bg-gradient-to-br from-yellow-500/10 to-black p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-yellow-500">Active</p>
            <span className="text-xl">⚡</span>
          </div>
          <p className="mt-3 text-3xl font-bold text-yellow-400">{stats.running}</p>
          <div className="mt-2 flex items-center gap-1">
            {stats.running > 0 ? (
              <>
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-yellow-400" />
                <p className="text-xs text-yellow-500/70">In progress</p>
              </>
            ) : (
              <p className="text-xs text-yellow-500/70">No active missions</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-blue-500/30 bg-gradient-to-br from-blue-500/10 to-black p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-blue-500">Scheduled</p>
            <span className="text-xl">📅</span>
          </div>
          <p className="mt-3 text-3xl font-bold text-blue-400">{stats.scheduled}</p>
          <p className="mt-1 text-xs text-blue-500/70">Awaiting deployment</p>
        </div>

        <div className="rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-black p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-500">Completed</p>
            <span className="text-xl">✅</span>
          </div>
          <p className="mt-3 text-3xl font-bold text-emerald-400">{stats.completed}</p>
          <p className="mt-1 text-xs text-emerald-500/70">Mission accomplished</p>
        </div>

        <div className="rounded-xl border border-red-500/30 bg-gradient-to-br from-red-500/10 to-black p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-red-500">Failed</p>
            <span className="text-xl">❌</span>
          </div>
          <p className="mt-3 text-3xl font-bold text-red-400">{stats.failed}</p>
          <p className="mt-1 text-xs text-red-500/70">Needs attention</p>
        </div>
      </div>

      {/* Success Rate */}
      <div className="rounded-xl border border-yellow-500/20 bg-gradient-to-r from-gray-900 to-black p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-yellow-400">🎯 Mission Success Rate</h3>
          <span className={`text-2xl font-bold ${stats.successRate >= 70 ? "text-emerald-400" : stats.successRate >= 40 ? "text-yellow-400" : "text-red-400"}`}>
            {stats.successRate}%
          </span>
        </div>
        <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-gray-800">
          <div
            className={`h-full rounded-full transition-all duration-500 ${stats.successRate >= 70 ? "bg-emerald-500" : stats.successRate >= 40 ? "bg-yellow-500" : "bg-red-500"}`}
            style={{ width: `${stats.successRate}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-xs text-gray-500">
          <span>{stats.completed} successful</span>
          <span>{stats.failed} failed</span>
        </div>
      </div>

      {/* Two Column */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Chart */}
        <div className="rounded-xl border border-yellow-500/20 bg-gradient-to-br from-gray-900 to-black p-5">
          <h3 className="text-sm font-medium text-yellow-400">📈 Night Patrol Activity</h3>
          <div className="mt-5 flex h-40 items-end justify-between gap-2">
            {chartData.days.map((day, index) => {
              const height = chartData.maxCount > 0 ? (day.count / chartData.maxCount) * 100 : 0;
              const isToday = index === chartData.days.length - 1;
              return (
                <div key={day.label} className="flex flex-1 flex-col items-center gap-2">
                  <span className="text-xs text-gray-500">{day.count}</span>
                  <div className="relative w-full flex-1">
                    <div
                      className={`absolute bottom-0 w-full rounded-t-md transition-all duration-500 ${isToday ? "bg-yellow-500" : "bg-gray-700"}`}
                      style={{ height: `${Math.max(height, 4)}%` }}
                    />
                  </div>
                  <span className={`text-xs ${isToday ? "text-yellow-400 font-medium" : "text-gray-600"}`}>{day.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Services Breakdown - 🔥 FIX: Added Comments */}
        <div className="rounded-xl border border-yellow-500/20 bg-gradient-to-br from-gray-900 to-black p-5">
          <h3 className="text-sm font-medium text-yellow-400">🦇 Arsenal Breakdown</h3>
          <div className="mt-5 space-y-4">
            {[
              { label: "👁️ Views", data: servicesBreakdown.views, color: "bg-yellow-500" },
              { label: "❤️ Likes", data: servicesBreakdown.likes, color: "bg-yellow-600" },
              { label: "🔄 Shares", data: servicesBreakdown.shares, color: "bg-yellow-700" },
              { label: "🔖 Saves", data: servicesBreakdown.saves, color: "bg-amber-600" },
              { label: "💬 Comments", data: servicesBreakdown.comments, color: "bg-pink-500" },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">{item.label}</span>
                  <span className="text-gray-500">{item.data.count.toLocaleString()} ({item.data.percent}%)</span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-gray-800">
                  <div className={`h-full rounded-full ${item.color} transition-all duration-500`} style={{ width: `${item.data.percent}%` }} />
                </div>
              </div>
            ))}

            <div className="mt-4 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3 text-center">
              <p className="text-xs text-gray-500">Total Engagements</p>
              <p className="text-xl font-bold text-yellow-400">{servicesBreakdown.total.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Orders */}
      <div className="rounded-xl border border-yellow-500/20 bg-gradient-to-br from-gray-900 to-black p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-yellow-400">⏰ Recent Missions</h3>
          <span className="text-xs text-gray-600">Last 5 operations</span>
        </div>

        {recentOrders.length === 0 ? (
          <div className="mt-5 rounded-lg border border-dashed border-yellow-500/30 py-8 text-center">
            <span className="text-4xl">🦇</span>
            <p className="mt-2 text-sm text-gray-500">No missions deployed yet</p>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {recentOrders.map((order) => {
              const realStatus = getRealStatus(order);
              return (
                <div key={order.id} className="flex items-center justify-between rounded-lg border border-gray-800 bg-black/50 p-3 transition hover:border-yellow-500/30">
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm ${getStatusBg(order)}`}>
                      {getStatusIcon(order)}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-white">{order.name || `Mission #${order.id.slice(0, 8)}`}</p>
                      <p className="text-xs text-gray-600">
                        {new Date(order.createdAt).toLocaleDateString()} at {new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${getStatusBg(order)} ${getStatusColor(order)}`}>
                      {realStatus}
                    </span>
                    <p className="mt-1 text-xs text-gray-600">{order.runs?.length || 0} runs</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-yellow-500/20 bg-black p-4 text-center">
          <p className="text-xs text-gray-500">Avg Runs/Mission</p>
          <p className="mt-1 text-xl font-bold text-yellow-400">
            {filteredOrders.length > 0 ? Math.round(filteredOrders.reduce((sum, o) => sum + (o.runs?.length || 0), 0) / filteredOrders.length) : 0}
          </p>
        </div>
        <div className="rounded-xl border border-yellow-500/20 bg-black p-4 text-center">
          <p className="text-xs text-gray-500">Total Runs Scheduled</p>
          <p className="mt-1 text-xl font-bold text-white">
            {filteredOrders.reduce((sum, o) => sum + (o.runs?.length || 0), 0)}
          </p>
        </div>
        <div className="rounded-xl border border-yellow-500/20 bg-black p-4 text-center">
          <p className="text-xs text-gray-500">Completed Runs</p>
          <p className="mt-1 text-xl font-bold text-emerald-400">
            {filteredOrders.reduce((sum, o) => sum + (o.completedRuns || 0), 0)}
          </p>
        </div>
      </div>

      {/* Clear Orders */}
      <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-medium text-orange-300">🧹 Clear Orders</h3>
            <p className="mt-1 text-xs text-orange-400/70">
              Delete all orders for a fresh start.<br />
              <span className="text-emerald-400">✓ APIs and Bundles will be kept safe!</span>
            </p>
          </div>

          {!showClearConfirm ? (
            <button type="button" onClick={() => setShowClearConfirm(true)} className="rounded-lg border border-orange-500/50 bg-orange-500/10 px-4 py-2 text-sm font-medium text-orange-200 transition hover:bg-orange-500/20">
              🗑️ Clear Orders
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-orange-300">Are you sure?</span>
              <button type="button" onClick={handleClearOrders} className="rounded-lg border border-red-500 bg-red-500/30 px-4 py-2 text-sm font-medium text-red-100 transition hover:bg-red-500/50">
                ✓ Yes, Delete Orders
              </button>
              <button type="button" onClick={() => setShowClearConfirm(false)} className="rounded-lg border border-gray-600 bg-gray-800 px-4 py-2 text-sm font-medium text-gray-300 transition hover:bg-gray-700">
                ✕ Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
