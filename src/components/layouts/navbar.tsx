/**
 * @fileoverview App navbar with navigation links and mobile drawer toggle.
 * On /user/* (feature) pages: logo links to dashboard; when logged in, Login/Sign up are hidden.
 */

"use client";

import { CalendarIcon, MapPinIcon, MenuIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuthCore } from "@/features/auth/store/auth/auth-core";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { UserNav } from "@/components/layouts/user-nav";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

const NavItems = [
  { href: "/", name: "Home" },
  {
    href: ROUTES.dashboard.trips,
    icon: <MapPinIcon className="h-4 w-4 mr-2" />,
    name: "Trips",
  },
  {
    href: ROUTES.dashboard.calendar,
    icon: <CalendarIcon className="h-4 w-4 mr-2" />,
    name: "Calendar",
  },
];

export function Navbar() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const initialize = useAuthCore((s) => s.initialize);
  const isAuthenticated = useAuthCore((s) => s.isAuthenticated);
  const user = useAuthCore((s) => s.user);

  useEffect(() => {
    initialize().catch(() => undefined);
  }, [initialize]);

  const logoHref = pathname.startsWith("/user/") ? ROUTES.dashboard.root : "/";

  return (
    <header className="sticky top-0 z-50 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link href={logoHref} className="font-bold text-xl flex items-center">
            TripSage<span className="text-highlight ml-1">AI</span>
          </Link>

          {/* Desktop navigation */}
          <nav className="hidden md:flex items-center gap-6">
            {NavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "text-sm font-medium transition-colors hover:text-primary flex items-center",
                  pathname === item.href ? "text-primary" : "text-muted-foreground"
                )}
              >
                {item.icon}
                {item.name}
              </Link>
            ))}
          </nav>
        </div>

        {/* User section */}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {isAuthenticated && user ? (
            <UserNav user={user} />
          ) : (
            <>
              <Button variant="outline" size="sm" asChild>
                <Link href={ROUTES.login}>Log in</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href={ROUTES.register}>Sign up</Link>
              </Button>
            </>
          )}

          {/* Mobile menu button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-navigation"
            aria-label={
              mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"
            }
          >
            {mobileMenuOpen ? (
              <XIcon aria-hidden="true" className="h-5 w-5" />
            ) : (
              <MenuIcon aria-hidden="true" className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>

      {/* Mobile navigation */}
      {mobileMenuOpen && (
        <nav id="mobile-navigation" className="md:hidden py-4 border-t">
          <div className="mx-auto flex w-full max-w-6xl flex-col space-y-3 px-4 sm:px-6 lg:px-8">
            {NavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "px-2 py-2 text-sm font-medium rounded-md flex items-center",
                  pathname === item.href
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted"
                )}
                onClick={() => setMobileMenuOpen(false)}
              >
                {item.icon}
                {item.name}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
