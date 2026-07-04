import React, { useState } from 'react';
import { X as XIcon, Copy, ChevronDown, MessageSquare, Phone, Mail, Link as LinkIcon, QrCode, UserPlus } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export function ShareModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'anyone' | 'invited'>('anyone');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-[440px] bg-[#212121] rounded-xl overflow-hidden border border-white/10 shadow-2xl"
      >
        <div className="p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-[18px] font-semibold text-[#efefef] tracking-tight">Share "Greeting"</h2>
            <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-full text-[#9e9e9e] hover:text-[#efefef] transition-colors">
              <XIcon className="w-4 h-4" />
            </button>
          </div>

          <div className="flex p-1 bg-[#1a1c1e] rounded-xl border border-white/5">
            <button 
              onClick={() => setActiveTab('anyone')}
              className={cn(
                "flex-1 py-2 text-[14px] font-medium rounded-lg transition-colors",
                activeTab === 'anyone' ? "bg-[#2c2d30] text-[#eaeaea] shadow-sm" : "text-[#8b8b8b] hover:text-[#eaeaea]"
              )}
            >
              Anyone with the link
            </button>
            <button 
              onClick={() => setActiveTab('invited')}
              className={cn(
                "flex-1 py-2 text-[14px] font-medium rounded-lg transition-colors border border-transparent",
                activeTab === 'invited' ? "bg-[#2c2d30] text-[#eaeaea] shadow-sm" : "text-[#8b8b8b] hover:text-[#eaeaea]"
              )}
            >
              Only invited people
            </button>
          </div>

          <div className="text-[13px] text-[#8b8b8b]">
            0 people can view by email invite.
          </div>

          <div className="flex items-center gap-2 p-1.5 pl-3 bg-[#1a1c1e] border border-white/5 rounded-xl mt-1">
            <LinkIcon className="w-4 h-4 text-[#8b8b8b] shrink-0" />
            <input 
              type="text" 
              readOnly 
              value="https://scholarly.so/chat/shared/6a35b4eb68736030807..." 
              className="flex-1 bg-transparent border-none outline-none text-[13px] text-[#b3b3b3] truncate"
            />
            <button className="px-4 py-2 bg-[#3358d4] hover:bg-[#2c4cb8] text-white text-[13px] font-semibold rounded-lg transition-colors shrink-0">
              Copy link
            </button>
          </div>

          <div className="flex items-center gap-5 mt-2 mb-1">
            <div className="flex flex-col items-center gap-1.5">
              <button className="w-11 h-11 rounded-full bg-[#34c759] flex items-center justify-center text-white hover:opacity-90 transition-opacity">
                <MessageSquare className="w-5 h-5 fill-current border-none" />
              </button>
              <span className="text-[11px] text-[#8b8b8b]">Messages</span>
            </div>
            
            <div className="flex flex-col items-center gap-1.5">
              <button className="w-11 h-11 rounded-full bg-white flex items-center justify-center text-black hover:opacity-90 transition-opacity">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 22.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path>
                </svg>
              </button>
              <span className="text-[11px] text-[#8b8b8b]">X</span>
            </div>

            <div className="flex flex-col items-center gap-1.5">
              <button className="w-11 h-11 rounded-full bg-[#25D366] flex items-center justify-center text-white hover:opacity-90 transition-opacity">
                <Phone className="w-5 h-5 fill-current border-none" />
              </button>
              <span className="text-[11px] text-[#8b8b8b]">WhatsApp</span>
            </div>

            <div className="flex flex-col items-center gap-1.5">
              <button className="w-11 h-11 rounded-full bg-[#4B5056] flex items-center justify-center text-white hover:opacity-90 transition-opacity">
                <Mail className="w-5 h-5" />
              </button>
              <span className="text-[11px] text-[#8b8b8b]">Email</span>
            </div>
          </div>

          <div className="flex flex-col mt-2">
            <button className="flex items-center justify-between py-2 hover:bg-white/5 transition-colors group">
              <div className="flex items-center gap-3 text-[#d1d1d1] group-hover:text-white transition-colors">
                <QrCode className="w-4 h-4" />
                <span className="text-[14px]">QR code</span>
              </div>
              <ChevronDown className="w-4 h-4 text-[#8b8b8b]" />
            </button>
            <button className="flex items-center justify-between py-2 hover:bg-white/5 transition-colors group mt-2">
              <div className="flex items-center gap-3 text-[#d1d1d1] group-hover:text-white transition-colors">
                <Mail className="w-4 h-4" />
                <span className="text-[14px]">Invite specific people</span>
              </div>
              <ChevronDown className="w-4 h-4 text-[#8b8b8b]" />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
