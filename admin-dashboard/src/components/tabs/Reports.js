import React, { useState } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import './Reports.css';

function Reports({ restaurantId }) {
  const [timeRange, setTimeRange] = useState('30days');

  // Mock data - replace with real API calls
  const revenueData = [
    { date: '11/01', revenue: 3200 },
    { date: '11/05', revenue: 4100 },
    { date: '11/10', revenue: 3800 },
    { date: '11/15', revenue: 4500 },
    { date: '11/20', revenue: 4200 },
    { date: '11/25', revenue: 4800 },
    { date: '11/30', revenue: 4185 },
  ];

  const topItems = [
    { name: 'Large Pepperoni', sales: 245, revenue: 4655 },
    { name: 'Wings (12pc)', sales: 189, revenue: 2831 },
    { name: 'Large Supreme', sales: 156, revenue: 3587 },
    { name: '2-Liter Coke', sales: 312, revenue: 1557 },
    { name: 'Garlic Bread', sales: 98, revenue: 490 },
  ];

  const conversionRate = 89;
  const laborSaved = 6820;

  const peakHours = [
    { hour: '11am', calls: 12, orders: 10 },
    { hour: '12pm', calls: 28, orders: 25 },
    { hour: '1pm', calls: 22, orders: 20 },
    { hour: '2pm', calls: 15, orders: 13 },
    { hour: '5pm', calls: 18, orders: 16 },
    { hour: '6pm', calls: 35, orders: 32 },
    { hour: '7pm', calls: 42, orders: 38 },
    { hour: '8pm', calls: 38, orders: 35 },
    { hour: '9pm', calls: 25, orders: 22 },
  ];

  return (
    <div className="reports">
      <div className="reports-header">
        <h2>Reports & Analytics</h2>
        <div className="time-range-selector">
          <button
            className={`range-btn ${timeRange === '7days' ? 'active' : ''}`}
            onClick={() => setTimeRange('7days')}
          >
            7 Days
          </button>
          <button
            className={`range-btn ${timeRange === '30days' ? 'active' : ''}`}
            onClick={() => setTimeRange('30days')}
          >
            30 Days
          </button>
          <button
            className={`range-btn ${timeRange === '90days' ? 'active' : ''}`}
            onClick={() => setTimeRange('90days')}
          >
            90 Days
          </button>
        </div>
      </div>

      <div className="reports-grid">
        <div className="report-card chart-card">
          <h3>Revenue Last 30 Days</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="#10b981"
                strokeWidth={3}
                dot={{ fill: '#10b981', r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="report-card chart-card">
          <h3>Top Selling Items</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topItems}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="sales" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="report-card">
          <h3>Conversion Rate</h3>
          <div className="conversion-display">
            <div className="conversion-value">{conversionRate}%</div>
            <div className="conversion-label">
              of calls converted to orders
              <br />
              <span className="conversion-note">(Usually 87-94%)</span>
            </div>
          </div>
        </div>

        <div className="report-card">
          <h3>Peak Hours Heatmap</h3>
          <div className="peak-hours-grid">
            {peakHours.map((hour) => {
              const intensity = (hour.orders / hour.calls) * 100;
              return (
                <div key={hour.hour} className="peak-hour-item">
                  <div className="peak-hour-label">{hour.hour}</div>
                  <div
                    className="peak-hour-bar"
                    style={{
                      height: `${intensity}%`,
                      backgroundColor: `rgba(16, 185, 129, ${intensity / 100})`,
                    }}
                  >
                    <span className="peak-hour-value">{hour.orders}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="report-card highlight-card">
          <h3>💰 Money Saved on Labor</h3>
          <div className="labor-saved">
            <div className="labor-amount">${laborSaved.toLocaleString()}</div>
            <div className="labor-label">
              saved this month vs hiring a phone person
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Reports;

