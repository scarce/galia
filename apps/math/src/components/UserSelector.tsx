"use client";

import { User } from "@/lib/types";

interface UserSelectorProps {
  users: User[];
  selectedUser: User | null;
  onSelectUser: (user: User) => void;
}

export default function UserSelector({
  users,
  selectedUser,
  onSelectUser,
}: UserSelectorProps) {
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex flex-wrap justify-center gap-6">
        {users.map((user) => (
          <button
            key={user.id}
            onClick={() => onSelectUser(user)}
            className={`flex h-28 w-28 flex-col items-center justify-center rounded-full transition-all duration-200 md:h-36 md:w-36 ${
              selectedUser?.id === user.id
                ? `${user.bgColor} scale-110 shadow-xl ring-4 ring-white`
                : `${user.bgColor} opacity-70 hover:opacity-100 hover:scale-105`
            }`}
          >
            <span className="text-4xl font-extrabold text-white md:text-5xl">
              {user.id}
            </span>
            <span className="mt-1 text-sm font-medium text-white/90 md:text-base">
              {user.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
