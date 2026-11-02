import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const CHART_DATE = new Date()

function AdminChart({ rows }) {
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(CHART_DATE.getFullYear(), CHART_DATE.getMonth() - 5 + index, 1)
    const match = rows.filter((entry) => entry._id.month === date.getMonth() + 1 && entry._id.year === date.getFullYear())
    return {
      month: date.toLocaleString(undefined, { month: 'short' }),
      Lost: match[0]?.lost || 0,
      Found: match[0]?.found || 0,
      Returned: match[0]?.returned || 0,
    }
  })
  return <div className="chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={months} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
    <defs>
      <linearGradient id="lostFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c36d57" stopOpacity={0.22} /><stop offset="95%" stopColor="#c36d57" stopOpacity={0} /></linearGradient>
      <linearGradient id="foundFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#52856c" stopOpacity={0.18} /><stop offset="95%" stopColor="#52856c" stopOpacity={0} /></linearGradient>
      <linearGradient id="returnedFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8c79a5" stopOpacity={0.18} /><stop offset="95%" stopColor="#8c79a5" stopOpacity={0} /></linearGradient>
    </defs>
    <CartesianGrid stroke="#eeeae2" vertical={false} />
    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#8c8a83', fontSize: 12 }} />
    <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#8c8a83', fontSize: 12 }} />
    <Tooltip />
    <Area type="monotone" dataKey="Lost" stroke="#c36d57" fill="url(#lostFill)" strokeWidth={2} />
    <Area type="monotone" dataKey="Found" stroke="#52856c" fill="url(#foundFill)" strokeWidth={2} />
    <Area type="monotone" dataKey="Returned" stroke="#8c79a5" fill="url(#returnedFill)" strokeWidth={2} />
  </AreaChart></ResponsiveContainer></div>
}

export default AdminChart
