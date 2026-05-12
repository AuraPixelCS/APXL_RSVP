import { useEffect, useState, useMemo } from "react";
import type { ReactElement } from "react";
import type { NextPageWithLayout } from "@/pages/_app";
import AdminLayout from "@/components/layout/AdminLayout";
import StatCard from "@/components/ui/StatCard";
import { getEvents, getRSVPs } from "@/lib/firestore";
import type { Event, RSVP } from "@/types";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area,
} from "recharts";
import { format, subDays, isAfter, parseISO } from "date-fns";

function UsersIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function TrendIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  );
}

const PIE_COLORS = ["#22c55e", "#f59e0b", "#3d9bf5", "#6b7280"];

const CustomTooltipContent = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs shadow-lg"
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
      }}
    >
      <p className="font-medium text-white mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
};

const DashboardPage: NextPageWithLayout = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [allRsvps, setAllRsvps] = useState<Map<string, RSVP[]>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAll() {
      try {
        const evts = await getEvents();
        setEvents(evts);

        const rsvpMap = new Map<string, RSVP[]>();
        await Promise.all(
          evts.map(async (evt) => {
            if (evt.id) {
              const rsvps = await getRSVPs(evt.id);
              rsvpMap.set(evt.id, rsvps);
            }
          })
        );
        setAllRsvps(rsvpMap);
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  // Aggregate stats
  const globalStats = useMemo(() => {
    let total = 0, attending = 0, pending = 0, checkedIn = 0;
    allRsvps.forEach((rsvps) => {
      rsvps.forEach((r) => {
        total++;
        if (r.attending) attending++;
        if (r.status === "pending" && r.attending) pending++;
        if (r.status === "checked_in") checkedIn++;
      });
    });
    return { total, attending, pending, checkedIn, events: events.length };
  }, [events, allRsvps]);

  // Bar chart: RSVPs per event
  const barData = useMemo(() => {
    return events.slice(0, 10).map((evt) => {
      const rsvps = allRsvps.get(evt.id!) || [];
      return {
        name: evt.title.length > 15 ? evt.title.slice(0, 15) + "…" : evt.title,
        RSVPs: rsvps.length,
        Attending: rsvps.filter((r) => r.attending).length,
        Allocated: rsvps.filter((r) => r.status === "allocated" || r.status === "checked_in").length,
      };
    });
  }, [events, allRsvps]);

  // Pie chart: status distribution
  const pieData = useMemo(() => {
    let allocated = 0, pending = 0, checkedIn = 0, notAttending = 0;
    allRsvps.forEach((rsvps) => {
      rsvps.forEach((r) => {
        if (r.status === "allocated") allocated++;
        else if (r.status === "pending") pending++;
        else if (r.status === "checked_in") checkedIn++;
        else if (r.status === "not_attending" || !r.attending) notAttending++;
      });
    });
    return [
      { name: "Allocated", value: allocated },
      { name: "Pending", value: pending },
      { name: "Checked In", value: checkedIn },
      { name: "Not Attending", value: notAttending },
    ].filter((d) => d.value > 0);
  }, [allRsvps]);

  // Area chart: RSVPs over last 14 days
  const areaData = useMemo(() => {
    const days: { date: string; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const day = subDays(new Date(), i);
      const dayStr = format(day, "yyyy-MM-dd");
      let count = 0;
      allRsvps.forEach((rsvps) => {
        rsvps.forEach((r) => {
          if (r.submittedAt && r.submittedAt.startsWith(dayStr)) count++;
        });
      });
      days.push({ date: format(day, "dd MMM"), count });
    }
    return days;
  }, [allRsvps]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div
          className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Dashboard</h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
          Overview of all events and RSVPs
        </p>
      </div>

      {/* Global stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard label="Total Events" value={globalStats.events} icon={<CalendarIcon />} color="#8b5cf6" />
        <StatCard label="Total RSVPs" value={globalStats.total} icon={<UsersIcon />} color="#3d9bf5" />
        <StatCard label="Attending" value={globalStats.attending} icon={<CheckIcon />} color="#22c55e" />
        <StatCard label="Pending" value={globalStats.pending} icon={<TrendIcon />} color="#f59e0b" />
        <StatCard label="Checked In" value={globalStats.checkedIn} icon={<CheckIcon />} color="#ec4899" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* RSVPs per Event */}
        <div
          className="rounded-xl p-5"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <h3 className="text-sm font-semibold text-white mb-4">RSVPs per Event</h3>
          <div style={{ width: "100%", height: 256 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} barGap={4} style={{ background: "transparent" }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "var(--muted)", fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--border)" }}
                />
                <YAxis
                  tick={{ fill: "var(--muted)", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  content={<CustomTooltipContent />}
                  cursor={{ fill: "rgba(255,255,255,0.04)", radius: 4 }}
                />
                <Bar dataKey="RSVPs" fill="#3d9bf5" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar dataKey="Attending" fill="#22c55e" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Status Distribution */}
        <div
          className="rounded-xl p-5"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <h3 className="text-sm font-semibold text-white mb-4">Status Distribution</h3>
          <div style={{ width: "100%", height: 256 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey="value"
                  stroke="none"
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltipContent />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                <Legend
                  wrapperStyle={{ fontSize: 11, color: "var(--muted)" }}
                  formatter={(value: string) => (
                    <span style={{ color: "var(--muted)", fontSize: 11 }}>{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* RSVP Trend */}
      <div
        className="rounded-xl p-5"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <h3 className="text-sm font-semibold text-white mb-4">RSVPs — Last 14 Days</h3>
        <div style={{ width: "100%", height: 256 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={areaData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="date"
                tick={{ fill: "var(--muted)", fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
              />
              <YAxis
                tick={{ fill: "var(--muted)", fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
                allowDecimals={false}
              />
              <Tooltip content={<CustomTooltipContent />} cursor={{ stroke: "rgba(255,255,255,0.08)", strokeWidth: 1 }} />
              <defs>
                <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3d9bf5" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3d9bf5" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="count"
                name="RSVPs"
                stroke="#3d9bf5"
                strokeWidth={2}
                fill="url(#colorCount)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

DashboardPage.getLayout = (page: ReactElement) => (
  <AdminLayout title="Dashboard — AuraPixel RSVP">{page}</AdminLayout>
);

export default DashboardPage;
