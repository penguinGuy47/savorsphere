import React, { useState } from 'react';
import { format } from 'date-fns';
import './CallLogs.css';

function CallLogs({ restaurantId }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [calls] = useState([
    {
      id: '1',
      date: new Date(),
      phone: '(555) 123-4567',
      duration: '4:32',
      orderTotal: 24.99,
      recordingUrl: '#',
    },
    {
      id: '2',
      date: new Date(Date.now() - 3600000),
      phone: '(555) 234-5678',
      duration: '3:15',
      orderTotal: 18.50,
      recordingUrl: '#',
    },
    {
      id: '3',
      date: new Date(Date.now() - 7200000),
      phone: '(555) 345-6789',
      duration: '5:48',
      orderTotal: 0,
      recordingUrl: '#',
    },
  ]);

  const filteredCalls = calls.filter(
    (call) =>
      call.phone.includes(searchTerm) ||
      format(call.date, 'MM/dd/yyyy HH:mm').includes(searchTerm)
  );

  const formatDuration = (duration) => {
    return duration;
  };

  const playRecording = (callId) => {
    // In real app, this would play the recording
    alert(`Playing recording for call ${callId}`);
  };

  return (
    <div className="call-logs">
      <div className="call-logs-header">
        <h2>Call Logs & Recordings</h2>
        <p className="section-description">
          Searchable table of every phone call. Use this to train staff.
        </p>
      </div>

      <div className="search-section">
        <input
          type="text"
          className="search-input"
          placeholder="Search by phone number or date..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="calls-table-container">
        <table className="calls-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Phone Number</th>
              <th>Duration</th>
              <th>Order Total</th>
              <th>Recording</th>
            </tr>
          </thead>
          <tbody>
            {filteredCalls.length === 0 ? (
              <tr>
                <td colSpan="5" className="no-calls">
                  No calls found
                </td>
              </tr>
            ) : (
              filteredCalls.map((call) => (
                <tr key={call.id}>
                  <td>{format(call.date, 'MM/dd/yyyy HH:mm')}</td>
                  <td className="phone-number">{call.phone}</td>
                  <td>{formatDuration(call.duration)}</td>
                  <td className={call.orderTotal > 0 ? 'order-total' : 'no-order'}>
                    {call.orderTotal > 0 ? `$${call.orderTotal.toFixed(2)}` : 'No order'}
                  </td>
                  <td>
                    <button
                      className="play-btn"
                      onClick={() => playRecording(call.id)}
                    >
                      ▶️ Play Recording
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="call-stats">
        <div className="stat-card">
          <div className="stat-value">{calls.length}</div>
          <div className="stat-label">Total Calls</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {calls.filter((c) => c.orderTotal > 0).length}
          </div>
          <div className="stat-label">Converted to Orders</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {calls.length > 0
              ? Math.round(
                  (calls.filter((c) => c.orderTotal > 0).length / calls.length) * 100
                )
              : 0}
            %
          </div>
          <div className="stat-label">Conversion Rate</div>
        </div>
      </div>
    </div>
  );
}

export default CallLogs;

