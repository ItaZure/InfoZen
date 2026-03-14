const Button = ({
  children,
  variant = 'primary',
  className = '',
  ...props
}) => {
  const baseStyles = `
    min-h-[44px] px-6 rounded-md font-sans font-medium
    transition-all duration-200 ease-out
    touch-manipulation
    disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none
  `;

  const variants = {
    primary: `
      bg-accent text-accent-foreground
      hover:bg-accent-secondary hover:shadow-md hover:-translate-y-0.5
      active:translate-y-0
    `,
    secondary: `
      bg-transparent border border-foreground text-foreground
      hover:bg-muted hover:border-accent hover:text-accent
    `,
    ghost: `
      bg-transparent text-muted-foreground
      hover:text-foreground hover:underline hover:decoration-accent
      hover:underline-offset-4
    `,
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
