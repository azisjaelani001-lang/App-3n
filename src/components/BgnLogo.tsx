import React from 'react';

interface BgnLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
}

export const BgnLogo: React.FC<BgnLogoProps> = ({
  className = '',
  size = 'md',
  showText = false,
}) => {
  const sizeMap = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
    xl: 'w-20 h-20',
  };

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className={`relative ${sizeMap[size]} shrink-0 rounded-full overflow-hidden flex items-center justify-center`}>
        <img
          src="/logo_bgn.png"
          alt="Logo Badan Gizi Nasional"
          className="w-full h-full object-cover object-center"
          onError={(e) => {
            // Fallback if image path has issue
            const target = e.currentTarget;
            if (target.src.indexOf('logo_bgn.jpg') === -1) {
              target.src = '/logo_bgn.jpg';
            }
          }}
        />
      </div>

      {showText && (
        <div className="leading-tight">
          <div className="font-black text-slate-900 tracking-tight flex items-center gap-1.5">
            <span>SPPG Jayamukti</span>
            <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded-md bg-amber-100 text-amber-900 border border-amber-300">
              BGN
            </span>
          </div>
          <div className="text-[11px] text-slate-500 font-medium">
            Badan Gizi Nasional Republik Indonesia
          </div>
        </div>
      )}
    </div>
  );
};
