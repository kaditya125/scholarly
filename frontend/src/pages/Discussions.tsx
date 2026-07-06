import { useState } from "react";
import { Link } from "react-router-dom";
import {
  MessageSquare, Hash, Search, Plus, Filter,
  Sparkles, ThumbsUp, MessageCircle, MoreHorizontal, AlertTriangle, Loader2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useDiscussions } from "../hooks/api/useDiscussions";

const ROOMS = [
  { id: "general", name: "General Discussions", icon: <Hash className="w-4 h-4" /> },
  { id: "doubt", name: "Doubt Clearing", icon: <MessageSquare className="w-4 h-4" /> },
  { id: "strategy", name: "Exam Strategy", icon: <Sparkles className="w-4 h-4" /> }
];

export default function Discussions() {
  const [activeRoom, setActiveRoom] = useState("general");
  const { discussions, isLoading, createDiscussion, isCreating } = useDiscussions(activeRoom);
  
  const [showCompose, setShowCompose] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newTopic, setNewTopic] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const handleCreate = async () => {
    setErrorMsg("");
    try {
      await createDiscussion({
        title: newTitle,
        topic: newTopic,
        description: newDesc,
        roomId: activeRoom
      });
      setShowCompose(false);
      setNewTitle("");
      setNewTopic("");
      setNewDesc("");
    } catch (err: any) {
      if (err.response && err.response.data && err.response.data.error) {
        setErrorMsg(err.response.data.error);
      } else {
        setErrorMsg("Failed to create thread.");
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#131314] transition-colors duration-300">
      
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 z-10 sticky top-0">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-teal-500" />
            Community
          </h1>
          <p className="text-sm text-slate-500 mt-1">AI Moderated & Summarized Discussions</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search discussions..." 
              className="pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-800 border-none rounded-full text-sm w-64 focus:ring-2 focus:ring-teal-500 outline-none"
            />
          </div>
          <button 
            onClick={() => setShowCompose(true)}
            className="flex items-center gap-2 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-full font-medium transition-colors text-sm shadow-sm"
          >
            <Plus className="w-4 h-4" />
            New Thread
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        
        {/* Sidebar Rooms */}
        <div className="w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 overflow-y-auto">
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-3">Rooms</h3>
            <div className="space-y-1">
              {ROOMS.map(room => (
                <button
                  key={room.id}
                  onClick={() => setActiveRoom(room.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeRoom === room.id 
                      ? 'bg-teal-50 text-teal-700 dark:bg-teal-500/20 dark:text-teal-400' 
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {room.icon}
                  {room.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-8 relative">
          
          <div className="max-w-4xl mx-auto">
            {/* Filter Bar */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2 text-sm">
                <button className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full font-medium shadow-sm hover:border-teal-500/50">Recent</button>
                <button className="px-3 py-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-300 font-medium">Top</button>
                <button className="px-3 py-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-300 font-medium">Unanswered</button>
              </div>
              <button className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white">
                <Filter className="w-4 h-4" /> Filter
              </button>
            </div>

            {/* Thread List */}
            {isLoading ? (
              <div className="flex justify-center p-12">
                <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
              </div>
            ) : discussions.length === 0 ? (
              <div className="p-12 text-center border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900">
                <MessageSquare className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-4" />
                <h3 className="text-lg font-bold mb-2">No discussions yet</h3>
                <p className="text-slate-500 mb-6">Be the first to start a conversation in this room.</p>
                <button onClick={() => setShowCompose(true)} className="px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-full font-medium">Start Thread</button>
              </div>
            ) : (
              <div className="space-y-4">
                {discussions.map(thread => (
                  <div key={thread.id} className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl hover:border-teal-500/30 transition-colors shadow-sm cursor-pointer group">
                    
                    <div className="flex gap-4">
                      {/* Avatars */}
                      <div className="flex-shrink-0 flex -space-x-2 overflow-hidden w-12 h-12">
                        {thread.participants?.map((p, i) => (
                          <img key={i} src={p.includes('http') ? p : "https://i.pravatar.cc/150?u="+p} alt="avatar" className="inline-block h-8 w-8 rounded-full ring-2 ring-white dark:ring-slate-900" />
                        ))}
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex items-start justify-between mb-1">
                          <h3 className="text-lg font-bold group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                            {thread.title}
                          </h3>
                          <span className="text-xs text-slate-400 whitespace-nowrap">
                            {thread.createdAt ? new Date(thread.createdAt).toLocaleDateString() : 'Just now'}
                          </span>
                        </div>
                        
                        <div className="flex flex-wrap gap-2 mb-3">
                          <span className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-md">
                            {thread.chapter}
                          </span>
                          <span className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-md">
                            {thread.topic}
                          </span>
                          {thread.aiAssisted && (
                            <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400 rounded-md flex items-center gap-1">
                              <Sparkles className="w-3 h-3" /> AI Moderated
                            </span>
                          )}
                        </div>
                        
                        <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2 mb-4">
                          {thread.description}
                        </p>

                        {thread.aiSummary && (
                          <div className="mb-4 p-3 bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30 rounded-xl">
                            <div className="flex items-center gap-2 mb-1">
                              <Sparkles className="w-4 h-4 text-indigo-500" />
                              <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">AI Summary</span>
                            </div>
                            <p className="text-sm text-indigo-900 dark:text-indigo-200 line-clamp-2">
                              {thread.aiSummary}
                            </p>
                          </div>
                        )}
                        
                        <div className="flex items-center gap-6 text-sm text-slate-500">
                          <div className="flex items-center gap-1.5 hover:text-teal-500 transition-colors">
                            <MessageCircle className="w-4 h-4" />
                            {thread.replies} replies
                          </div>
                          <div className="flex items-center gap-1.5">
                            <ThumbsUp className="w-4 h-4" />
                            {thread.views || 0} likes
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Compose Modal */}
      <AnimatePresence>
        {showCompose && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-[32px] p-8 max-w-2xl w-full shadow-2xl border border-slate-200 dark:border-slate-800"
            >
              <h2 className="text-2xl font-bold mb-6">Create New Thread</h2>
              
              {errorMsg && (
                <div className="mb-4 p-4 bg-rose-100 dark:bg-rose-500/20 border border-rose-200 dark:border-rose-900/50 rounded-xl flex items-start gap-3 text-rose-700 dark:text-rose-400">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                  <p className="text-sm">{errorMsg}</p>
                </div>
              )}

              <div className="space-y-4 mb-8">
                <div>
                  <label className="block text-sm font-medium mb-1">Title (Optional, AI will summarize if blank)</label>
                  <input 
                    type="text" 
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    placeholder="Enter a descriptive title..."
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Topic</label>
                  <input 
                    type="text" 
                    value={newTopic}
                    onChange={e => setNewTopic(e.target.value)}
                    placeholder="e.g. Fundamental Rights"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Description</label>
                  <textarea 
                    value={newDesc}
                    onChange={e => setNewDesc(e.target.value)}
                    placeholder="Write your question or discussion point here... (Markdown & Math supported)"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 h-32 resize-none"
                  />
                </div>
              </div>

              <div className="flex gap-3 justify-end items-center">
                <span className="text-xs text-slate-400 mr-auto flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Note: Posts are auto-moderated by AI.
                </span>
                <button 
                  onClick={() => setShowCompose(false)}
                  className="px-6 py-3 rounded-xl font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleCreate}
                  disabled={isCreating || !newDesc || !newTopic}
                  className="flex items-center gap-2 px-6 py-3 bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white rounded-xl font-medium shadow-md shadow-teal-500/20"
                >
                  {isCreating ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Post Thread'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
