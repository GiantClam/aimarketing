"use client";

import { useState, useEffect } from "react";
import { MessageSquare, Plus, Edit2, Trash2, Check, X, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface Conversation {
  id: string;
  name: string;
  status: string;
  created_at: number;
}

export function AdvisorSidebarItem({
  title,
  advisorType,
  userEmail,
  icon: Icon,
}: {
  title: string;
  advisorType: string;
  userEmail: string;
  icon: any;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editingConvName, setEditingConvName] = useState("");

  const pathname = usePathname();
  const router = useRouter();
  const user = `${userEmail}_${advisorType}`;

  const fetchConversations = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/dify/conversations?user=${user}&limit=20&advisorType=${advisorType}`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data.data || []);
      }
    } catch (e) {
      console.error("Failed to load conversations", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchConversations();
    }
  }, [isOpen, user]);

  useEffect(() => {
    const handleRefresh = (e: any) => {
      if (e.detail?.advisorType === advisorType && isOpen) {
        fetchConversations();
      }
    };
    window.addEventListener("dify-refresh", handleRefresh);
    return () => window.removeEventListener("dify-refresh", handleRefresh);
  }, [advisorType, isOpen]);

  useEffect(() => {
    if (pathname.includes(`/dashboard/advisor/${advisorType}`)) {
      setIsOpen(true);
    }
  }, [pathname, advisorType]);

  const handleDelete = async (convId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await fetch(`/api/dify/conversations/${convId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user, advisorType }),
      });
      fetchConversations();
      if (pathname.includes(convId)) {
        router.push(`/dashboard/advisor/${advisorType}/new`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRenameStart = (conv: Conversation, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingConvId(conv.id);
    setEditingConvName(conv.name);
  };

  const handleRenameSave = async (convId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await fetch(`/api/dify/conversations/${convId}/name`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user, name: editingConvName, advisorType }),
      });
      setEditingConvId(null);
      fetchConversations();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRenameCancel = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingConvId(null);
  };

  return (
    <div className="mb-2">
      <Button
        variant="ghost"
        className={cn("w-full justify-between font-manrope", isOpen && "bg-sidebar-accent text-sidebar-accent-foreground")}
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center">
          <Icon className="w-4 h-4 mr-2" />
          {title}
        </div>
        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </Button>

      {isOpen && (
        <div className="ml-4 mt-1 pl-2 border-l border-sidebar-border space-y-1">
          <Link href={`/dashboard/advisor/${advisorType}/new`}>
            <Button variant="ghost" className="w-full justify-start text-xs h-8 text-primary hover:text-primary/80">
              <Plus className="w-3 h-3 mr-2" />
              新建会话
            </Button>
          </Link>

          {isLoading && conversations.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground flex items-center">
              <Loader2 className="w-3 h-3 mr-2 animate-spin" /> 加载中...
            </div>
          ) : conversations.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">暂无会话</div>
          ) : (
            conversations.map((conv) => {
              const isActive = pathname === `/dashboard/advisor/${advisorType}/${conv.id}`;
              return (
                <Link key={conv.id} href={`/dashboard/advisor/${advisorType}/${conv.id}`}>
                  <div
                    className={cn(
                      "group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors text-xs",
                      isActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "hover:bg-sidebar-accent text-sidebar-foreground hover:text-sidebar-accent-foreground",
                    )}
                  >
                    {editingConvId === conv.id ? (
                      <div className="flex items-center gap-1 w-full" onClick={(e) => e.preventDefault()}>
                        <Input
                          value={editingConvName}
                          onChange={(e) => setEditingConvName(e.target.value)}
                          className="h-6 px-1 py-0 text-xs flex-1 border-primary/50 text-foreground"
                          autoFocus
                        />
                        <button onClick={(e) => handleRenameSave(conv.id, e)} className="p-1 hover:text-green-600 text-foreground">
                          <Check className="w-3 h-3" />
                        </button>
                        <button onClick={(e) => handleRenameCancel(e)} className="p-1 hover:text-red-600 text-foreground">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 truncate flex-1 md:max-w-[140px]">
                          <MessageSquare className="w-3 h-3 shrink-0 opacity-70" />
                          <span className="truncate">{conv.name || "新对话"}</span>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={(e) => handleRenameStart(conv, e)} className="p-1 hover:text-foreground">
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button onClick={(e) => handleDelete(conv.id, e)} className="p-1 hover:text-destructive">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </Link>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
