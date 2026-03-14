import { forwardRef } from 'react';

const Input = forwardRef(({
  className = '',
  ...props
}, ref) => {
  return (
    <input
      ref={ref}
      className={`
        h-12 w-full px-4 rounded-md
        bg-transparent border border-border
        text-foreground font-sans
        placeholder:text-muted-foreground/60
        transition-all duration-150 ease-out
        hover:border-muted-foreground
        focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:border-accent
        ${className}
      `}
      {...props}
    />
  );
});

Input.displayName = 'Input';

export default Input;
