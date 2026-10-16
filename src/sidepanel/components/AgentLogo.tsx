import React from 'react';

export const AgentLogo: React.FC<{ className?: string }> = ({ className = '' }) => <img
  className={`agent-logo ${className}`} src="icons/logo.svg" alt="" aria-hidden="true" draggable={false}
/>;
