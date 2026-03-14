import { forwardRef, useEffect } from 'react';

const Textarea = forwardRef(({
  className = '',
  onChange,
  value,
  ...props
}, ref) => {
  // 自动调整高度
  useEffect(() => {
    if (ref && ref.current) {
      const textarea = ref.current;
      // 先重置为最小高度（44px），这样 scrollHeight 才能正确反映内容的实际高度
      textarea.style.height = '44px';
      // 强制重排以确保 scrollHeight 更新
      textarea.offsetHeight;
      // 计算新高度，但不超过最大高度
      const maxHeight = window.innerHeight / 5; // 屏幕高度的 1/5
      const newHeight = Math.min(textarea.scrollHeight, maxHeight);
      textarea.style.height = `${newHeight}px`;
    }
  }, [value, ref]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      rows={1}
      style={{ minHeight: '44px' }}
      className={`
        w-full px-4 py-2.5 rounded-md resize-none
        bg-transparent border border-border
        text-foreground font-sans
        placeholder:text-muted-foreground/60
        transition-colors duration-150 ease-out
        hover:border-muted-foreground
        focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:border-accent
        overflow-y-auto
        ${className}
      `}
      {...props}
    />
  );
});

Textarea.displayName = 'Textarea';

export default Textarea;
