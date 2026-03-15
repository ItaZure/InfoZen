import { useState } from 'react';

// 生成过去52周的日期格子（从今天往前推364天，按周列排列）
function buildHeatmapData(activityDates) {
  const countByDay = {};
  activityDates.forEach(({ day, count }) => {
    countByDay[day] = count;
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // 从周日开始对齐
  const startOffset = (today.getDay() + 1) % 7; // 让最后一列以今天结尾
  const totalDays = 52 * 7;
  const start = new Date(today);
  start.setDate(today.getDate() - totalDays + 1 - startOffset);

  const weeks = [];
  let week = [];
  for (let i = 0; i <= totalDays + startOffset; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    week.push({ date: key, count: countByDay[key] || 0 });
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) weeks.push(week);
  return weeks;
}

function getColor(count) {
  if (count === 0) return 'bg-muted';
  if (count <= 2) return 'bg-green-200';
  if (count <= 5) return 'bg-green-400';
  if (count <= 10) return 'bg-green-600';
  return 'bg-green-800';
}

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

function HeatmapView({ activityDates }) {
  const [tooltip, setTooltip] = useState(null);
  const weeks = buildHeatmapData(activityDates);

  // 计算月份标签位置
  const monthLabels = [];
  weeks.forEach((week, wi) => {
    const firstDay = week.find((d) => d.date);
    if (!firstDay) return;
    const date = new Date(firstDay.date);
    if (date.getDate() <= 7) {
      monthLabels.push({ wi, label: MONTH_LABELS[date.getMonth()] });
    }
  });

  return (
    <div className="p-4">
      <div className="overflow-x-auto">
        <div className="inline-flex flex-col gap-1 min-w-0">
          {/* 月份标签行 */}
          <div className="flex gap-[3px] ml-8">
            {weeks.map((_, wi) => {
              const ml = monthLabels.find((m) => m.wi === wi);
              return (
                <div key={wi} className="w-[11px] text-[9px] text-muted-foreground font-sans">
                  {ml ? ml.label : ''}
                </div>
              );
            })}
          </div>

          {/* 格子主体（7行 × 52列） */}
          <div className="flex gap-[3px]">
            {/* 星期标签 */}
            <div className="flex flex-col gap-[3px] mr-1">
              {DAY_LABELS.map((label, i) => (
                <div key={i} className="h-[11px] text-[9px] text-muted-foreground font-sans leading-[11px] w-7 text-right pr-1">
                  {label}
                </div>
              ))}
            </div>

            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                {week.map((cell, di) => (
                  <div
                    key={di}
                    className={`w-[11px] h-[11px] rounded-sm ${getColor(cell.count)} cursor-default relative`}
                    onMouseEnter={(e) => setTooltip({ date: cell.date, count: cell.count, x: e.clientX, y: e.clientY })}
                    onMouseLeave={() => setTooltip(null)}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* 图例 */}
          <div className="flex items-center justify-end gap-1 mt-2">
            <span className="text-[10px] text-muted-foreground font-sans mr-1">Less</span>
            {['bg-muted', 'bg-green-200', 'bg-green-400', 'bg-green-600', 'bg-green-800'].map((c, i) => (
              <div key={i} className={`w-[11px] h-[11px] rounded-sm ${c}`} />
            ))}
            <span className="text-[10px] text-muted-foreground font-sans ml-1">More</span>
          </div>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-foreground text-background text-xs font-sans px-2 py-1 rounded pointer-events-none"
          style={{ left: tooltip.x + 8, top: tooltip.y - 28 }}
        >
          {tooltip.count} 次提问 · {tooltip.date}
        </div>
      )}
    </div>
  );
}

const LearningLog = ({ logs, activityDates, unsummarizedCount, onUpdateLogs, isUpdating, topicId, onLogsChange }) => {
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingContent, setEditingContent] = useState('');
  const [deletingIndex, setDeletingIndex] = useState(null);

  const handleEditStart = (index, summary) => {
    setEditingIndex(index);
    setEditingContent(summary);
  };

  const handleEditSave = async (index) => {
    const log = logs[index];
    try {
      const res = await fetch(`/api/topics/${encodeURIComponent(topicId)}/logs/${log.timeRange}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: editingContent }),
      });

      if (!res.ok) throw new Error('更新失败');

      // 更新本地 state
      const newLogs = [...logs];
      newLogs[index] = { ...newLogs[index], summary: editingContent };
      onLogsChange(newLogs);

      setEditingIndex(null);
    } catch (err) {
      alert('更新日志失败，请稍后重试');
      console.error(err);
    }
  };

  const handleDeleteConfirm = async (index) => {
    const log = logs[index];
    try {
      const res = await fetch(`/api/topics/${encodeURIComponent(topicId)}/logs/${log.timeRange}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('删除失败');

      // 从本地 state 移除
      const newLogs = logs.filter((_, i) => i !== index);
      onLogsChange(newLogs);

      setDeletingIndex(null);
    } catch (err) {
      alert('删除日志失败，请稍后重试');
      console.error(err);
    }
  };

  return (
    <div className="h-full flex flex-col bg-muted/30 rounded-lg border border-border">
      {/* 固定头部 */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <h3 className="font-serif text-xl font-semibold">学习日志</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={onUpdateLogs}
            disabled={isUpdating || unsummarizedCount === 0}
            className="relative px-4 py-2 bg-accent text-accent-foreground rounded-md font-sans text-sm font-medium hover:bg-accent-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUpdating ? '生成中...' : '智能日志更新'}
            {!isUpdating && unsummarizedCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {unsummarizedCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 热力视图 */}
      <HeatmapView activityDates={activityDates} />

      {/* 可滚动日志列表 */}
      <div className="flex-1 overflow-y-auto p-6">
        {logs.length === 0 ? (
          <div className="text-muted-foreground font-sans text-center py-12">
            点击"智能日志更新"按钮生成学习总结...
          </div>
        ) : (
          <div className="space-y-3">
            {logs.map((log, index) => (
              <div key={index} className="group bg-card border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-mono font-semibold text-accent">{log.timeRange}</h4>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleEditStart(index, log.summary)}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => setDeletingIndex(index)}
                      className="text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded hover:bg-muted"
                    >
                      删除
                    </button>
                  </div>
                </div>

                {editingIndex === index ? (
                  <div className="space-y-2">
                    <textarea
                      value={editingContent}
                      onChange={(e) => setEditingContent(e.target.value)}
                      className="w-full text-sm font-sans bg-background border border-border rounded p-2 resize-none focus:outline-none focus:ring-1 focus:ring-accent"
                      rows={4}
                    />
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setEditingIndex(null)}
                        className="text-xs px-3 py-1 rounded border border-border hover:bg-muted transition-colors"
                      >
                        取消
                      </button>
                      <button
                        onClick={() => handleEditSave(index)}
                        className="text-xs px-3 py-1 rounded bg-accent text-accent-foreground hover:bg-accent-secondary transition-colors"
                      >
                        保存
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="font-sans text-sm text-foreground leading-relaxed whitespace-pre-wrap pl-1">
                    {log.summary}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 删除二次确认遮罩 */}
      {deletingIndex !== null && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-lg z-10">
          <div className="bg-card border border-border rounded-lg p-6 mx-6 shadow-lg">
            <p className="font-sans text-sm text-foreground mb-4">
              确定要删除 <span className="font-mono text-accent">{logs[deletingIndex]?.timeRange}</span> 的日志吗？
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeletingIndex(null)}
                className="text-sm px-4 py-2 rounded border border-border hover:bg-muted transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => handleDeleteConfirm(deletingIndex)}
                className="text-sm px-4 py-2 rounded bg-destructive text-destructive-foreground hover:opacity-90 transition-opacity"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LearningLog;
