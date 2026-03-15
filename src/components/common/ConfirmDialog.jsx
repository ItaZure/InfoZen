const ConfirmDialog = ({ isOpen, title, message, onConfirm, onCancel, confirmText = '确认', cancelText = '取消', confirmDanger = false }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-foreground/50 z-50 flex items-center justify-center p-8"
      onClick={onCancel}
    >
      <div
        className="bg-card rounded-lg border border-border shadow-lg max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-serif text-xl font-semibold mb-3 text-foreground">
          {title}
        </h3>
        <p className="font-sans text-muted-foreground mb-6 leading-relaxed">
          {message}
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-md font-sans text-sm font-medium bg-muted text-foreground hover:bg-border transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-md font-sans text-sm font-medium transition-colors ${
              confirmDanger
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-accent text-accent-foreground hover:bg-accent-secondary'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
