import { useState, useEffect, useRef, useCallback } from 'react';

const API = 'http://localhost:10101/api/wisdom';

// ── Toast ──────────────────────────────────────────────────
const Toast = ({ message, onClose }) => {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 bg-red-50 border border-red-200 rounded-md shadow-md font-sans text-sm text-red-600 flex items-center gap-3">
      <span>{message}</span>
      <button onClick={onClose} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
    </div>
  );
};

// ── 快捷链接行 ──────────────────────────────────────────────
const QuickLinks = () => {
  const [links, setLinks] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');

  useEffect(() => {
    fetch(`${API}/quick-links`)
      .then((r) => r.json())
      .then((d) => setLinks(d.links ?? []));
  }, []);

  const handleAdd = async () => {
    if (!name.trim() || !url.trim()) return;
    const res = await fetch(`${API}/quick-links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), url: url.trim() }),
    });
    const link = await res.json();
    setLinks((prev) => [...prev, link]);
    setName('');
    setUrl('');
    setShowForm(false);
  };

  const handleDelete = async (id) => {
    await fetch(`${API}/quick-links/${id}`, { method: 'DELETE' });
    setLinks((prev) => prev.filter((l) => l.id !== id));
  };

  return (
    <div className="flex flex-wrap items-center gap-2 mb-6">
      {links.map((link) => (
        <div key={link.id} className="group relative">
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-4 py-2 border border-border rounded-md font-sans text-sm text-foreground hover:border-accent hover:text-accent transition-colors duration-150"
          >
            {link.name}
          </a>
          <button
            onClick={() => handleDelete(link.id)}
            className="absolute -top-1.5 -right-1.5 hidden group-hover:flex items-center justify-center w-4 h-4 rounded-full bg-muted-foreground text-white text-xs leading-none"
            title="删除"
          >
            ×
          </button>
        </div>
      ))}

      {showForm ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            placeholder="名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="px-3 py-1.5 border border-border rounded-md font-sans text-sm focus:outline-none focus:border-accent w-24"
          />
          <input
            placeholder="URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            className="px-3 py-1.5 border border-border rounded-md font-sans text-sm focus:outline-none focus:border-accent w-48"
          />
          <button onClick={handleAdd} className="px-3 py-1.5 bg-accent text-white rounded-md font-sans text-sm">保存</button>
          <button onClick={() => setShowForm(false)} className="px-3 py-1.5 border border-border rounded-md font-sans text-sm text-muted-foreground">取消</button>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center px-4 py-2 border border-dashed border-border rounded-md font-sans text-sm text-muted-foreground hover:border-accent hover:text-accent transition-colors duration-150"
        >
          + 添加
        </button>
      )}
    </div>
  );
};

// ── URL 输入框 ──────────────────────────────────────────────
const UrlInput = ({ onSubmit, loading }) => {
  const [value, setValue] = useState('');

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && value.trim() && !loading) {
      onSubmit(value.trim());
      setValue('');
    }
  };

  return (
    <div className="relative mb-8">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="粘贴链接，按 Enter 提交"
        disabled={loading}
        className="w-full px-4 py-3 border border-border rounded-md font-sans text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent transition-colors duration-150 disabled:opacity-50"
      />
      {loading && (
        <div className="absolute right-4 top-1/2 -translate-y-1/2">
          <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
};

// ── 摘要卡片 ──────────────────────────────────────────────
const ArticleCard = ({ article, onDelete }) => {
  const [expanded, setExpanded] = useState(false);

  if (article.status === 'loading') {
    return (
      <div className="border border-border rounded-md overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <span className="font-sans text-sm text-muted-foreground">{article.domain}</span>
          </div>
        </div>
        <div className="px-4 py-4 space-y-2">
          <div className="h-3 bg-muted rounded animate-pulse w-3/4" />
          <div className="h-3 bg-muted rounded animate-pulse w-full" />
          <div className="h-3 bg-muted rounded animate-pulse w-5/6" />
        </div>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-md overflow-hidden hover:border-muted-foreground transition-colors duration-150">
      {/* 状态栏 */}
      <div className="flex items-start justify-between px-4 py-3 border-b border-border">
        <div className="flex-1 min-w-0 pr-4">
          {article.title_en && (
            <p className="font-sans text-sm font-medium text-accent truncate">{article.title_en}</p>
          )}
          <p className="font-sans text-sm text-muted-foreground truncate">{article.title_zh}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-accent transition-colors duration-150"
            title="在新标签页打开"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
          <button
            onClick={() => onDelete(article.id)}
            className="text-muted-foreground hover:text-red-500 transition-colors duration-150 text-lg leading-none"
            title="删除"
          >
            ×
          </button>
        </div>
      </div>

      {/* 摘要内容 */}
      <div
        className="px-4 py-3 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <p className={`font-sans text-sm text-foreground leading-relaxed whitespace-pre-wrap ${expanded ? '' : 'line-clamp-3'}`}>{article.summary}</p>
      </div>
    </div>
  );
};

// ── 主页面 ──────────────────────────────────────────────────
const Wisdom = () => {
  const [articles, setArticles] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);
  const sentinelRef = useRef(null);

  const loadArticles = useCallback(async (p) => {
    setLoadingMore(true);
    const res = await fetch(`${API}/articles?page=${p}&limit=10`);
    const data = await res.json();
    setArticles((prev) => p === 1 ? data.articles : [...prev, ...data.articles]);
    setHasMore(data.hasMore);
    setLoadingMore(false);
  }, []);

  useEffect(() => { loadArticles(1); }, [loadArticles]);

  // 懒加载 IntersectionObserver
  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMore && !loadingMore) {
        const next = page + 1;
        setPage(next);
        loadArticles(next);
      }
    }, { threshold: 0.1 });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, page, loadArticles]);

  const handleSubmit = async (url) => {
    setSubmitting(true);
    let domain;
    try { domain = new URL(url).hostname; } catch { domain = url; }

    const tempId = `loading-${Date.now()}`;
    setArticles((prev) => [{ id: tempId, status: 'loading', domain }, ...prev]);

    try {
      const res = await fetch(`${API}/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const err = await res.json();
        const msg = err.error === 'FETCH_FAILED' ? '抓取失败，请检查链接是否正确' : '摘要生成失败，请稍后重试';
        setArticles((prev) => prev.filter((a) => a.id !== tempId));
        setToast(msg);
      } else {
        const article = await res.json();
        setArticles((prev) => prev.map((a) => a.id === tempId ? article : a));
      }
    } catch {
      setArticles((prev) => prev.filter((a) => a.id !== tempId));
      setToast('网络错误，请稍后重试');
    }
    setSubmitting(false);
  };

  const handleDelete = async (id) => {
    if (typeof id === 'string' && id.startsWith('loading-')) {
      setArticles((prev) => prev.filter((a) => a.id !== id));
      return;
    }
    await fetch(`${API}/articles/${id}`, { method: 'DELETE' });
    setArticles((prev) => prev.filter((a) => a.id !== id));
  };

  // 按日期分组
  const grouped = articles.reduce((acc, article) => {
    if (article.status === 'loading' || article.status === 'error') {
      const key = 'pending';
      if (!acc[key]) acc[key] = [];
      acc[key].push(article);
      return acc;
    }
    const day = article.created_at?.slice(0, 10) ?? 'unknown';
    if (!acc[day]) acc[day] = [];
    acc[day].push(article);
    return acc;
  }, {});

  return (
    <div className="max-w-2xl mx-auto py-12 px-8">
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
      <QuickLinks />
      <UrlInput onSubmit={handleSubmit} loading={submitting} />

      <div className="space-y-6">
        {grouped['pending']?.map((a) => (
          <ArticleCard key={a.id} article={a} onDelete={handleDelete} />
        ))}

        {Object.entries(grouped)
          .filter(([key]) => key !== 'pending')
          .sort(([a], [b]) => b.localeCompare(a))
          .map(([day, dayArticles]) => (
            <div key={day}>
              <p className="font-mono text-xs text-muted-foreground mb-3 tracking-widest uppercase">{day}</p>
              <div className="space-y-3">
                {dayArticles.map((a) => (
                  <ArticleCard key={a.id} article={a} onDelete={handleDelete} />
                ))}
              </div>
            </div>
          ))}
      </div>

      <div ref={sentinelRef} className="h-8" />
      {loadingMore && (
        <div className="flex justify-center py-4">
          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
};

export default Wisdom;
