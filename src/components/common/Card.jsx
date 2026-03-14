const Card = ({
  children,
  className = '',
  accentTop = false,
  elevated = false,
  ...props
}) => {
  return (
    <div
      className={`
        bg-card rounded-lg border border-border
        transition-all duration-200
        ${elevated ? 'shadow-md' : 'shadow-sm'}
        ${accentTop ? 'border-t-2 border-t-accent' : ''}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
};

export default Card;
