const LearningLog = ({ logs, onUpdateLogs }) => {
  return (
    <div className="h-full overflow-auto bg-muted/30 rounded-lg border border-border p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-serif text-xl font-semibold">学习日志</h3>
        <button
          onClick={onUpdateLogs}
          className="px-4 py-2 bg-accent text-accent-foreground rounded-md font-sans text-sm font-medium hover:bg-accent-secondary transition-colors"
        >
          更新日志
        </button>
      </div>

      <div className="space-y-4">
        {logs.length === 0 ? (
          <div className="text-muted-foreground font-sans text-center py-12">
            点击"更新日志"按钮生成学习总结...
          </div>
        ) : (
          logs.map((log, index) => (
            <div key={index} className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-mono text-accent">📅</span>
                <h4 className="font-sans font-medium text-foreground">{log.timeRange}</h4>
              </div>
              <p className="font-sans text-sm text-muted-foreground pl-6">
                {log.summary}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default LearningLog;
