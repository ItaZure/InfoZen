import { Link, useLocation } from 'react-router-dom';

const Header = () => {
  const location = useLocation();

  const navItems = [
    { path: '/', label: '对谈' },
    { path: '/wisdom', label: '拾慧' },
    { path: '/notes', label: '笔记' },
  ];

  const isActive = (path) => location.pathname === path;

  return (
    <header className="border-b border-border bg-card">
      <div className="px-6 py-6">
        <div className="flex items-center gap-12">
          <h1 className="font-serif text-2xl font-semibold text-foreground tracking-tight">
            InfoZen
          </h1>

          <ul className="flex gap-8">
            {navItems.map((item) => (
              <li key={item.path}>
                <Link
                  to={item.path}
                  className={`
                    font-sans text-sm font-medium tracking-wide-sm
                    transition-colors duration-200
                    ${isActive(item.path)
                      ? 'text-accent border-b-2 border-accent pb-1'
                      : 'text-muted-foreground hover:text-foreground'
                    }
                  `}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </header>
  );
};

export default Header;
