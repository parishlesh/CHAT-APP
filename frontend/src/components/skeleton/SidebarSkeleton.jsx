import { Users } from "lucide-react";
import React from "react";

const SidebarSkeleton = () => {
  const skeletonContacts = Array(8).fill(null);

  return (
    <div className="h-full w-20 lg:w-72 border-r border-base-200 flex flex-col transition-all duration-200">
      {/* Header */}
      <div className="border-b border-base-300 w-full p-6">
        <div className="flex items-center gap-2">
          <Users className="w-6 h-6" />
          <span className="hidden lg:inline-block">Contacts</span>
        </div>
      </div>

      {/* Skeleton Contacts */}
      <div className="overflow-y-auto w-full py-3 space-y-4 px-3">
        {skeletonContacts.map((_, idx) => (
          <div key={idx} className="flex items-center gap-3">
            {/* Profile Picture Skeleton */}
            <div className="skeleton size-12 rounded-full" />

            {/* Skeleton only for larger screens */}
            <div className="hidden lg:block min-w-0 flex-1">
              <div className="skeleton h-4 w-24 mb-2" />
              <div className="skeleton h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SidebarSkeleton;
