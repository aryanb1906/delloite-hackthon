'use client';

import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LogOut, User, Settings, BarChart3 } from 'lucide-react';
import Link from 'next/link';

export function UserMenu() {
  const { user, logout, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
    );
  }

  if (!user) {
    return null;
  }

  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-9 w-9 rounded-full">
          <Avatar className="h-9 w-9">
            <AvatarImage src={user.avatar} alt={user.name} />
            <AvatarFallback className="bg-primary text-primary-foreground text-sm">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{user.name}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {user.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/chat" className="cursor-pointer">
            <User className="mr-2 h-4 w-4" />
            <span>Chat</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/analytics" className="cursor-pointer">
            <BarChart3 className="mr-2 h-4 w-4" />
            <span>Analytics</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings" className="cursor-pointer">
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer text-destructive focus:text-destructive"
          onClick={() => logout()}
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AuthButtons() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-20 h-9 rounded-md bg-muted animate-pulse" />
      </div>
    );
  }

  if (user) {
    return (
      <div className="flex items-center gap-3">
        <Link href="/chat">
          <Button>Go to Chat</Button>
        </Link>
        <UserMenu />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link href="/login">
        <Button variant="outline">Sign In</Button>
      </Link>
      <Link href="/register">
        <Button>Get Started</Button>
      </Link>
    </div>
  );
}

export function MobileAuthButtons() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />;
  }

  return (
    <div className="flex items-center gap-2">
      {user && <UserMenu />}
      <Link href={user ? '/chat' : '/login'}>
        <Button size="sm">{user ? 'Chat' : 'Sign In'}</Button>
      </Link>
    </div>
  );
}
