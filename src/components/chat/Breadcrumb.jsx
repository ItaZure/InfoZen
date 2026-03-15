import { useState } from 'react';

const Breadcrumb = ({ path, onNodeClick, messageCount = 0 }) => {
  const [expanded, setExpanded] = useState(false);

  if (path.length === 0) {
    return (
      <div className="flex flex-col h-full bg-muted/30 rounded-lg border border-border p-6">
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground font-sans text-center">
            开始对话后，这里会显示对话路径...
          </p>
        </div>
        <div className="flex justify-end">
          <span className="text-xs text-muted-foreground font-sans">已进行 {messageCount} 次对话</span>
        </div>
      </div>
    );
  }

  // 智能省略：超过4个节点时，显示首节点 + ... + 最近3个
  let displayPath = path;
  let hasEllipsis = false;

  if (path.length > 4 && !expanded) {
    displayPath = [
      path[0], // 首节点
      { id: 'ellipsis', label: '...', isEllipsis: true },
      ...path.slice(-3), // 最近3个节点
    ];
    hasEllipsis = true;
  }

  return (
    <div className="h-full overflow-auto bg-muted/30 rounded-lg border border-border p-6 flex flex-col">
      <div className="flex-1">
        <div className="flex flex-wrap items-center gap-2">
        {displayPath.map((node, index) => (
          <div key={node.id} className="flex items-center gap-2">
            {node.isEllipsis ? (
              <button
                onClick={() => setExpanded(true)}
                className="px-3 py-1 text-muted-foreground hover:text-accent transition-colors font-sans text-sm"
              >
                {node.label}
              </button>
            ) : (
              <button
                onClick={() => onNodeClick && onNodeClick(node)}
                className={`
                  px-4 py-2 rounded-md font-sans text-sm
                  transition-all duration-200
                  ${index === displayPath.length - 1
                    ? 'bg-card text-accent border-2 border-accent font-medium'
                    : `bg-card text-foreground border ${
                        node.summarized
                          ? 'border-green-400 hover:border-green-500'
                          : 'border-border hover:border-accent'
                      } hover:bg-muted`
                  }
                `}
              >
                {node.label}
              </button>
            )}
            {index < displayPath.length - 1 && !node.isEllipsis && (
              <span className="text-muted-foreground">›</span>
            )}
          </div>
        ))}
      </div>

      {/* 当前节点的分支列表 */}
      {path.length > 0 && path[path.length - 1].children && path[path.length - 1].children.length > 0 && (
        <div className="mt-6 pt-6 border-t border-border">
          <p className="text-xs text-muted-foreground font-mono mb-3 uppercase tracking-wider">
            可选分支 ({path[path.length - 1].children.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {path[path.length - 1].children.map((child) => (
              <button
                key={child.id}
                onClick={() => onNodeClick && onNodeClick(child)}
                className={`px-3 py-1.5 rounded-md font-sans text-sm bg-card border ${
                  child.summarized
                    ? 'border-green-400 hover:border-green-500'
                    : 'border-border hover:border-accent'
                } text-foreground hover:bg-muted transition-all duration-200`}
              >
                {child.label}
              </button>
            ))}
          </div>
        </div>
      )}
      </div>
      <div className="mt-3 flex justify-end">
        <span className="text-xs text-muted-foreground font-sans">已进行 {messageCount} 次对话</span>
      </div>
    </div>
  );
};

export default Breadcrumb;
