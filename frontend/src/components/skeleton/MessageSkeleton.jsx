import React from "react";

const MessageSkeleton = () => {
  return (
    <div className="flex items-center space-x-4 p-4 bg-gray-200 rounded-lg animate-pulse">
      <div className="w-12 h-12 bg-gray-300 rounded-full"></div>
      <div className="flex-1">
        <div className="h-4 bg-gray-300 rounded w-1/3 mb-2"></div>
        <div className="h-3 bg-gray-300 rounded w-2/3"></div>
      </div>
    </div>
  );
};

export default MessageSkeleton;
