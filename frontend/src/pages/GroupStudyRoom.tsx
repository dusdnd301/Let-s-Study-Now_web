import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import {
  studyRoomAPI,
  timerAPI,
  sessionAPI,
  GroupStudyRoom,
  TimerStatusResponse,
  StudyRoomParticipant,
  LevelInfoDto,
} from "@/lib/api";
import { webSocketService, WebSocketMessage } from "@/lib/websocket";
import {
  Clock,
  Send,
  LogOut,
  Play,
  Pause,
  BookOpen,
  Coffee,
  TrendingUp,
  HelpCircle,
  MessageCircle,
  CheckCircle,
  X,
  AlertCircle,
  Image as ImageIcon,
  Users,
  Copy,
} from "lucide-react";

interface HelpAnswer {
  id: string;
  answerer: string;
  content: string;
  timestamp: Date;
  isAccepted?: boolean;
}

interface ChatMessage {
  id: string;
  type: "text" | "system" | "question";
  sender?: string;
  content: string;
  timestamp: Date;
  answers?: HelpAnswer[];
  status?: "open" | "helping" | "resolved";
  imageUrl?: string;
  fileName?: string;
}

const GroupStudyRoomPage: React.FC = () => {
  const { user } = useAuth();
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const hasJoinedRef = useRef(false);
  const isLeavingRef = useRef(false);

  // Room Info
  const [roomInfo, setRoomInfo] = useState<GroupStudyRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Chat
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState("");

  // Participants
  const [participants, setParticipants] = useState<StudyRoomParticipant[]>([]);

  // My Status
  const [myStatus, setMyStatus] = useState<"studying" | "resting">("studying");

  // Session
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [currentSeconds, setCurrentSeconds] = useState(0);
  const intervalRef = useRef<any>(null);

  // Timer Status
  const [timerStatus, setTimerStatus] = useState<TimerStatusResponse | null>(null);

  // Level Info
  const [levelInfo, setLevelInfo] = useState<LevelInfoDto | null>(null);

  // Pomodoro Timer
  const [pomodoroMode, setPomodoroMode] = useState<"work" | "shortBreak" | "longBreak">("work");
  const [pomodoroTime, setPomodoroTime] = useState(25 * 60);
  const [pomodoroIsRunning, setPomodoroIsRunning] = useState(false);
  const [pomodoroCycle, setPomodoroCycle] = useState(1);
  const pomodoroIntervalRef = useRef<any>(null);

  // Question mode
  const [isQuestionMode, setIsQuestionMode] = useState(false);
  const [questionImage, setQuestionImage] = useState<string | null>(null);
  const [questionFileName, setQuestionFileName] = useState<string | null>(null);

  // Answer input
  const [answerInputs, setAnswerInputs] = useState<Record<string, string>>({});

  // Dialogs
  const [questionListOpen, setQuestionListOpen] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [exitDialogOpen, setExitDialogOpen] = useState(false);

  // ==========================================
  // 함수들 (컴포넌트 내부)
  // ==========================================

  // WebSocket 메시지 처리
  const handleWebSocketMessage = (wsMessage: WebSocketMessage) => {
    console.log("📩 Received:", wsMessage);
    const msgId = (wsMessage.id || wsMessage.messageId || Date.now()).toString();

    if (wsMessage.type === "QUESTION") {
      const newMsg: ChatMessage = {
        id: msgId,
        type: "question",
        sender: wsMessage.sender,
        content: wsMessage.message,
        imageUrl: wsMessage.imageUrl,
        timestamp: new Date(wsMessage.sentAt),
        answers: [],
        status: "open",
      };
      setMessages((prev) => [...prev, newMsg]);
      return;
    }

    if (wsMessage.type === "ANSWER" && wsMessage.refId) {
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id === wsMessage.refId?.toString() && msg.type === "question") {
            const newAnswer: HelpAnswer = {
              id: msgId,
              answerer: wsMessage.sender,
              content: wsMessage.message,
              timestamp: new Date(wsMessage.sentAt),
            };
            return {
              ...msg,
              answers: [...(msg.answers || []), newAnswer],
              status: "helping" as const,
            };
          }
          return msg;
        })
      );
      return;
    }

    if (wsMessage.type === "SOLVE") {
      console.log("✅ SOLVE message received:", wsMessage);

      if (wsMessage.refId) {
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id === wsMessage.refId?.toString() && msg.type === "question") {
              console.log("✅ Marking question as SOLVED:", msg.id);
              return {
                ...msg,
                status: "resolved" as const,
              };
            }
            return msg;
          })
        );
      }

      addSystemMessage(wsMessage.message);
      return;
    }

    if (wsMessage.type === "SYSTEM") {
      addSystemMessage(wsMessage.message);
      return;
    }

    if (wsMessage.type === "TALK") {
      const newMsg: ChatMessage = {
        id: msgId,
        type: "text",
        sender: wsMessage.sender,
        content: wsMessage.message,
        imageUrl: wsMessage.imageUrl,
        timestamp: new Date(wsMessage.sentAt),
      };
      setMessages((prev) => [...prev, newMsg]);
    }
  };

  // 채팅 내역 불러오기
  const loadChatHistory = async (roomIdNum: number) => {
    try {
      const { chatAPI } = await import("@/lib/api");
      const response = await chatAPI.getChatHistory(roomIdNum, "GROUP", 0);

      console.log("📦 Chat history response:", response);

      if (!Array.isArray(response)) {
        console.warn("⚠️ Chat history is not an array:", response);
        setMessages([]);
        return;
      }

      if (response.length === 0) {
        console.log("✅ No chat history found");
        setMessages([]);
        return;
      }

      // API 응답을 ChatMessage 형식으로 변환
      const loadedMessages: ChatMessage[] = response.map((apiMsg: any) => {
        const baseMessage: ChatMessage = {
          id: apiMsg.id?.toString() || apiMsg.messageId?.toString() || Date.now().toString(),
          type: apiMsg.type === "QUESTION" ? "question" : apiMsg.type === "SYSTEM" ? "system" : "text",
          sender: apiMsg.sender,
          content: apiMsg.message,
          imageUrl: apiMsg.imageUrl,
          timestamp: new Date(apiMsg.sentAt),
        };

        if (apiMsg.type === "QUESTION") {
          baseMessage.status = apiMsg.isSolved ? "resolved" : "open";
          baseMessage.answers = [];
        }

        return baseMessage;
      });

      // 답변 메시지들을 해당 질문에 연결
      loadedMessages.forEach((msg) => {
        const apiMsg = response.find((m: any) => 
          (m.id?.toString() || m.messageId?.toString()) === msg.id
        );
        
        if (apiMsg && apiMsg.type === "ANSWER" && apiMsg.refId) {
          const questionMsg = loadedMessages.find(
            (m) => m.id === apiMsg.refId?.toString() && m.type === "question"
          );
          if (questionMsg) {
            const answer: HelpAnswer = {
              id: msg.id,
              answerer: msg.sender || "익명",
              content: msg.content,
              timestamp: msg.timestamp,
            };
            if (!questionMsg.answers) questionMsg.answers = [];
            questionMsg.answers.push(answer);
            if (questionMsg.answers.length > 0 && questionMsg.status !== "resolved") {
              questionMsg.status = "helping";
            }
          }
        }
      });

      // ANSWER 타입 제외
      const filteredMessages = loadedMessages.filter(
        (msg) => msg.type !== "text" || !response.find((m: any) => 
          (m.id?.toString() || m.messageId?.toString()) === msg.id && m.type === "ANSWER"
        )
      );

      setMessages(filteredMessages);
      console.log("✅ Chat history loaded:", filteredMessages.length, "messages");
    } catch (error) {
      console.error("❌ Failed to load chat history:", error);
      setMessages([]);
    }
  };

  // 시간 포맷
  const formatRelativeTime = (date: Date) => {
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diff < 60) return "방금 전";
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
    return `${Math.floor(diff / 86400)}일 전`;
  };

  // 초대 링크 복사
  const handleCopyInviteLink = () => {
    const inviteLink = `${window.location.origin}/#/group-study/room/${roomId}`;
    navigator.clipboard.writeText(inviteLink);
    toast({
      title: "초대 링크 복사 완료",
      description: "초대 링크가 클립보드에 복사되었습니다.",
    });
  };

  // 메시지 전송
  const handleSendMessage = () => {
    if (!messageInput.trim() || !roomId) return;

    const roomIdNum = Number(roomId);

    if (isQuestionMode) {
      webSocketService.sendMessage({
        type: "QUESTION",
        roomType: "GROUP",
        roomId: roomIdNum,
        message: messageInput,
      });

      setMessageInput("");
      setIsQuestionMode(false);
      setQuestionImage(null);
      setQuestionFileName(null);

      toast({
        title: "질문 등록",
        description: "질문이 등록되었습니다!",
      });
    } else {
      webSocketService.sendMessage({
        type: "TALK",
        roomType: "GROUP",
        roomId: roomIdNum,
        message: messageInput,
      });
      setMessageInput("");
    }
  };

  // 시스템 메시지 추가
  const addSystemMessage = (content: string) => {
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      type: "system",
      content,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, newMessage]);
  };

  // 이미지 업로드
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // ✅ 파일 타입 검사
    if (!file.type.startsWith("image/")) {
      toast({
        title: "오류",
        description: "이미지 파일만 업로드할 수 있습니다.",
        variant: "destructive",
      });
      return;
    }

    // ✅ 파일 크기 검사
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "오류",
        description: "이미지 크기는 10MB를 초과할 수 없습니다.",
        variant: "destructive",
      });
      return;
    }

    if (isQuestionMode) {
      const imageUrl = URL.createObjectURL(file);
      setQuestionImage(imageUrl);
      setQuestionFileName(file.name);
    } else {
      try {
        console.log("🖼️ 이미지 업로드 시작:", {
          name: file.name,
          type: file.type,
          size: file.size,
          sizeKB: (file.size / 1024).toFixed(2) + "KB",
        });

        // ✅ 토큰 확인
        const token = localStorage.getItem("authToken");
        console.log("🔑 JWT 토큰 존재:", !!token);
        if (!token) {
          toast({
            title: "인증 필요",
            description: "로그인이 필요합니다.",
            variant: "destructive",
          });
          return;
        }
        
        const { chatAPI } = await import("@/lib/api");
        console.log("🚀 chatAPI.uploadImage 호출...");
        
        const imageUrl = await chatAPI.uploadImage(file);
        
        console.log("✅ 업로드 성공! URL:", imageUrl);

        if (roomId) {
          const roomIdNum = parseInt(roomId, 10);
          webSocketService.sendMessage({
            type: "TALK",
            roomType: "GROUP",
            roomId: roomIdNum,
            message: imageUrl,
          });
          console.log("📡 WebSocket 메시지 전송 완료");
        }

        toast({
          title: "이미지 전송 완료",
          description: "이미지가 전송되었습니다.",
        });
      } catch (error: any) {
        console.error("❌ 이미지 업로드 실패!");
        console.error("에러 객체:", error);
        console.error("에러 메시지:", error?.message);
        console.error("에러 상태:", error?.status);
        console.error("에러 상세:", error?.details);
        
        let errorMessage = "이미지 업로드에 실패했습니다.";
        
        if (error?.status === 401) {
          errorMessage = "로그인이 필요합니다. 다시 로그인해주세요.";
        } else if (error?.status === 413) {
          errorMessage = "파일 크기가 너무 큽니다.";
        } else if (error?.status === 500) {
          errorMessage = "서버 오류가 발생했습니다. 백엔드 서버 로그를 확인해주세요.";
          // 서버 에러 원문 출력
          if (error?.details?.raw) {
            console.error("🔍 서버 에러 원문:", error.details.raw);
          }
        } else if (error?.message) {
          errorMessage = error.message;
        }
        
        toast({
          title: "업로드 실패",
          description: errorMessage,
          variant: "destructive",
        });
      }
    }
  };

  // 답변 제출
  const handleSubmitAnswer = (questionId: string) => {
    const answerText = answerInputs[questionId];
    if (!answerText?.trim() || !roomId) return;

    webSocketService.sendMessage({
      type: "ANSWER",
      roomType: "GROUP",
      roomId: Number(roomId),
      message: answerText,
      refId: Number(questionId),
    });

    setAnswerInputs((prev) => ({ ...prev, [questionId]: "" }));
    toast({ title: "답변 등록", description: "답변이 등록되었습니다!" });
  };

  // 답변 채택
  const handleAcceptAnswer = async (questionId: string, answerId: string) => {
    try {
      console.log("👑 Accepting answer:", { questionId, answerId });

      const { chatAPI } = await import("@/lib/api");
      await chatAPI.solveQuestion(Number(questionId), Number(answerId));

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === questionId && msg.type === "question"
            ? {
                ...msg,
                answers: msg.answers?.map((ans) =>
                  ans.id === answerId ? { ...ans, isAccepted: true } : ans
                ),
                status: "resolved" as const,
              }
            : msg
        )
      );

      toast({
        title: "답변 채택 완료",
        description: "답변이 채택되어 질문이 해결되었습니다! 🎉",
      });
    } catch (error: any) {
      console.error("Failed to accept answer:", error);
      toast({
        title: "채택 실패",
        description: error?.message || "답변 채택에 실패했습니다.",
        variant: "destructive",
      });
    }
  };

  // 질문으로 스크롤
  const scrollToQuestion = (questionId: string) => {
    setQuestionListOpen(false);

    setTimeout(() => {
      const element = document.getElementById(`question-${questionId}`);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        element.classList.add("ring-4", "ring-red-300", "ring-opacity-50");
        setTimeout(() => {
          element.classList.remove("ring-4", "ring-red-300", "ring-opacity-50");
        }, 2000);
      }
    }, 100);
  };

  // 질문 삭제
  const handleDeleteQuestion = async (questionId: string) => {
    try {
      console.log("🗑️ Deleting question:", questionId);

      const { chatAPI } = await import("@/lib/api");
      await chatAPI.deleteMessage(Number(questionId));

      setMessages((prev) => prev.filter((msg) => msg.id !== questionId));

      toast({
        title: "삭제 완료",
        description: "질문이 삭제되었습니다.",
      });
    } catch (error: any) {
      console.error("Failed to delete question:", error);
      toast({
        title: "삭제 실패",
        description: error?.message || "질문 삭제에 실패했습니다.",
        variant: "destructive",
      });
    }
  };

  // 방 나가기
  const handleExitRoom = async () => {
    if (!roomId || !roomInfo) return;

    const isCreator = user && roomInfo.creatorId === Number(user.id);

    if (isCreator) {
      const confirmExit = confirm(
        "방장이 나가면 다른 참여자에게 방장 권한이 이양되거나 방이 삭제됩니다.\n정말로 나가시겠습니까?"
      );

      if (!confirmExit) {
        setExitDialogOpen(false);
        return;
      }
    }

    await leaveRoom();
    toast({
      title: "방 나가기 완료",
      description: "스터디룸에서 나왔습니다.",
    });

    setExitDialogOpen(false);
    navigate("/group-study");
  };

  // 시간 포맷
  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
        .toString()
        .padStart(2, "0")}`;
    }
    return `${minutes.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  // 상태 전환
  const handleStatusToggle = (newStatus: "studying" | "resting") => {
    if (myStatus === newStatus) return;

    if (newStatus === "resting" && myStatus === "studying") {
      addSystemMessage(
        `${user?.username}님이 휴식 모드로 전환했습니다. (공부 시간: ${formatTime(
          currentSeconds
        )})`
      );
    } else if (newStatus === "studying" && myStatus === "resting") {
      addSystemMessage(`${user?.username}님이 공부 모드로 전환했습니다.`);
    }

    setMyStatus(newStatus);
  };

  // 뽀모도로 타이머 핸들러
  const handlePomodoroStart = () => {
    setPomodoroIsRunning(true);
  };

  const handlePomodoroPause = () => {
    setPomodoroIsRunning(false);
  };

  const handlePomodoroReset = () => {
    setPomodoroIsRunning(false);
    if (pomodoroMode === "work") {
      setPomodoroTime(25 * 60);
    } else if (pomodoroMode === "shortBreak") {
      setPomodoroTime(5 * 60);
    } else {
      setPomodoroTime(15 * 60);
    }
    toast({
      title: "뽀모도로 리셋",
      description: "타이머가 초기화되었습니다.",
    });
  };

  const handlePomodoroModeChange = (mode: "work" | "shortBreak" | "longBreak") => {
    setPomodoroIsRunning(false);
    setPomodoroMode(mode);
    if (mode === "work") {
      setPomodoroTime(25 * 60);
    } else if (mode === "shortBreak") {
      setPomodoroTime(5 * 60);
    } else {
      setPomodoroTime(15 * 60);
    }
  };

  // 참여자 목록 새로고침 함수
  const refreshParticipants = async () => {
    if (!roomId || !roomInfo) return;
    
    try {
      const pList = await studyRoomAPI.getParticipants(roomId);
      console.log("🔄 Participants refreshed:", pList.length);
      
      if (Array.isArray(pList)) {
        const participantList = pList.map((p: any) => ({
          memberId: p.memberId,
          username: p.memberId === roomInfo.creatorId ? roomInfo.creatorUsername : `사용자${p.memberId}`,
          profileImageUrl: undefined,
          joinedAt: p.joinedAt,
        }));
        
        setParticipants(participantList as any);
      }
    } catch (error) {
      console.error("Failed to refresh participants:", error);
    }
  };

  // 방 나가기 함수
  const leaveRoom = async () => {
    if (!roomId || isLeavingRef.current) return;
    isLeavingRef.current = true;

    try {
      console.log("🚪 Leaving room...");

      // 1. WebSocket 구독 해제 및 연결 종료 (재연결 방지)
      if (roomId) {
        console.log("🔌 Disconnecting WebSocket (preventing reconnection)...");
        webSocketService.unsubscribe(Number(roomId), "GROUP");
        webSocketService.disconnect(true); // ✅ 재연결 차단
      }

      // 2. 방 나가기 API 호출 (백엔드에서 세션/타이머 자동 종료)
      if (user?.id) {
        try {
          await studyRoomAPI.leaveRoom(roomId, Number(user.id));
          console.log("✅ Leave room API success");
        } catch (leaveError: any) {
          console.error("❌ Leave room API failed:", leaveError);
          
          // 방장 퇴장 불가 에러 처리
          if (leaveError?.message?.includes("방 생성자는")) {
            toast({
              title: "퇴장 불가",
              description: "방 생성자는 방을 나갈 수 없습니다. 방 삭제 기능을 사용해주세요.",
              variant: "destructive",
            });
            isLeavingRef.current = false;
            
            // WebSocket 재연결 (퇴장 취소이므로)
            webSocketService.connect(
              () => console.log("WebSocket reconnected after failed leave"),
              (error) => console.error("WebSocket reconnection failed:", error)
            );
            
            return;
          }
          
          // 다른 에러는 무시하고 계속 진행 (UI 정리는 해야 함)
          console.warn("Leave API failed but continuing with cleanup:", leaveError.message);
        }
      }

      // 3. UI 정리 (세션, 타이머 state 초기화)
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (pomodoroIntervalRef.current) {
        clearInterval(pomodoroIntervalRef.current);
        pomodoroIntervalRef.current = null;
      }
      
      setCurrentSeconds(0);
      setSessionId(null);
      setIsSessionActive(false);
      setPomodoroIsRunning(false);
      hasJoinedRef.current = false;
      
      console.log("✅ Successfully left the room");
    } catch (error) {
      console.error("Failed to leave room:", error);
      hasJoinedRef.current = false;
    } finally {
      isLeavingRef.current = false;
    }
  };

  // 방 삭제 기능 (방장 전용)
  const deleteRoom = async () => {
    if (!roomId || !user?.id) return;

    try {
      console.log("🗑️ Deleting room...");

      // 1. WebSocket 구독 해제 및 연결 종료
      if (roomId) {
        webSocketService.unsubscribe(Number(roomId), "GROUP");
        webSocketService.disconnect(true); // ✅ 재연결 차단
      }

      // 2. UI 정리
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (pomodoroIntervalRef.current) {
        clearInterval(pomodoroIntervalRef.current);
        pomodoroIntervalRef.current = null;
      }

      // 3. 방 삭제 API 호출 (백엔드에서 세션/타이머 자동 종료)
      await studyRoomAPI.deleteRoom(roomId, Number(user.id));
      
      hasJoinedRef.current = false;
      
      toast({
        title: "방 삭제 완료",
        description: "스터디 방이 삭제되었습니다.",
      });

      // 4. 그룹 스터디 메인으로 이동
      navigate("/group-study");
      
      console.log("✅ Room deleted successfully");
    } catch (error: any) {
      console.error("Failed to delete room:", error);
      
      let errorMessage = "방 삭제에 실패했습니다.";
      
      if (error?.message?.includes("방 생성자만")) {
        errorMessage = "방 생성자만 방을 삭제할 수 있습니다.";
      } else if (error?.message?.includes("다른 멤버가")) {
        errorMessage = "다른 멤버가 있을 때는 방을 삭제할 수 없습니다.";
      } else if (error?.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: "삭제 실패",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  // ==========================================
  // useEffect들
  // ==========================================

  // 채팅 스크롤
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 레벨 정보 조회
  useEffect(() => {
    const fetchLevelInfo = async () => {
      try {
        const info = await sessionAPI.getLevelInfo();
        setLevelInfo(info);
      } catch (error) {
        console.error("Failed to fetch level info:", error);
      }
    };

    if (user) {
      fetchLevelInfo();
    }
  }, [user]);

  // 타이머 실시간 업데이트
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (myStatus === "studying") {
      intervalRef.current = setInterval(() => {
        setCurrentSeconds((prevSeconds) => prevSeconds + 1);
      }, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [myStatus]);

  // 뽀모도로 타이머
  useEffect(() => {
    if (pomodoroIntervalRef.current) {
      clearInterval(pomodoroIntervalRef.current);
      pomodoroIntervalRef.current = null;
    }

    if (pomodoroIsRunning && pomodoroTime > 0) {
      pomodoroIntervalRef.current = setInterval(() => {
        setPomodoroTime((prev) => {
          if (prev <= 1) {
            setPomodoroIsRunning(false);

            if (pomodoroMode === "work") {
              toast({
                title: "🎉 작업 완료!",
                description: "휴식을 취하세요!",
              });

              if (pomodoroCycle === 4) {
                setPomodoroMode("longBreak");
                setPomodoroTime(15 * 60);
                setPomodoroCycle(1);
              } else {
                setPomodoroMode("shortBreak");
                setPomodoroTime(5 * 60);
                setPomodoroCycle((prev) => prev + 1);
              }
            } else {
              toast({
                title: "휴식 완료",
                description: "다시 공부를 시작하세요!",
              });
              setPomodoroMode("work");
              setPomodoroTime(25 * 60);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (pomodoroIntervalRef.current) {
        clearInterval(pomodoroIntervalRef.current);
        pomodoroIntervalRef.current = null;
      }
    };
  }, [pomodoroIsRunning, pomodoroTime, pomodoroMode, pomodoroCycle]);

  // 타이머 상태 폴링
  useEffect(() => {
    if (!user || !roomId || !hasJoinedRef.current) return;

    const interval = setInterval(async () => {
      try {
        const status = await timerAPI.getTimerStatus();
        setTimerStatus(status);
      } catch (error) {
        console.error("타이머 상태 조회 실패:", error);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [user, roomId]);

  // 방 입장 처리
  useEffect(() => {
    if (!user || !roomId || hasJoinedRef.current) return;

    const timeoutId = setTimeout(() => {
      if (loading) {
        console.error("입장 타임아웃 - 로딩 상태 강제 해제");
        setLoading(false);
        toast({
          title: "입장 시간 초과",
          description: "방 입장에 시간이 너무 오래 걸립니다. 다시 시도해주세요.",
          variant: "destructive",
        });
      }
    }, 30000);

    const joinRoom = async () => {
      try {
        setLoading(true);
        console.log("=== 방 입장 시작 ===");

        // 1. 방 정보 로드
        let roomData: GroupStudyRoom;
        try {
          roomData = await studyRoomAPI.getRoom(roomId);
          console.log("Room data loaded:", roomData);
          setRoomInfo(roomData);

          // 참여자 목록 로드
          try {
            const pList = await studyRoomAPI.getParticipants(roomId);
            console.log("📋 Participants API response:", pList);
            
            if (Array.isArray(pList) && pList.length > 0) {
              const participantList = pList.map((p: any) => ({
                memberId: p.memberId,
                username: p.memberId === roomData.creatorId ? roomData.creatorUsername : `사용자${p.memberId}`,
                profileImageUrl: undefined,
                joinedAt: p.joinedAt,
              }));
              
              console.log("✅ Mapped participants:", participantList);
              setParticipants(participantList as any);
            }
          } catch (e) {
            console.error("Failed to load participants:", e);
            // 참여자 로드 실패해도 방 입장은 계속
            setParticipants([]);
          }
        } catch (error: any) {
          console.error("Failed to get room info:", error);
          clearTimeout(timeoutId);
          setLoading(false);
          setError(error?.message || "방 정보를 불러올 수 없습니다.");
          toast({
            title: "오류",
            description: error?.message || "방 정보를 불러올 수 없습니다.",
            variant: "destructive",
          });
          setTimeout(() => {
            navigate("/group-study");
          }, 3000);
          return;
        }

        // 2. 방 참여
        try {
          if (user?.id) {
            await studyRoomAPI.joinRoom(roomId, Number(user.id));
            console.log("Successfully joined room via API");
          }
        } catch (joinError: any) {
          console.log("방 참여 요청 결과 (계속 진행):", joinError);
        }

        // WebSocket 연결
        webSocketService.connect(
          () => {
            console.log("✅ WebSocket connected");
            const roomIdNum = Number(roomId);
            
            // 채팅 내역 불러오기
            loadChatHistory(roomIdNum);
            
            // 구독 시작
            webSocketService.subscribe(roomIdNum, "GROUP", handleWebSocketMessage);
          },
          (err) => {
            console.error("❌ WebSocket error:", err);
          }
        );

        hasJoinedRef.current = true;

        // 3. 세션 및 타이머 상태 로드 (백엔드에서 joinRoom 시 자동 시작됨)
        try {
          // 레벨 정보 조회
          const levelInfo = await sessionAPI.getLevelInfo();
          console.log("✅ Level info loaded:", levelInfo);
        } catch (sessionError: any) {
          console.warn("레벨 정보 로드 실패:", sessionError);
        }

        try {
          // 타이머 상태 조회
          const timerResponse = await timerAPI.getTimerStatus();
          setTimerStatus(timerResponse);
          console.log("✅ Timer status loaded:", timerResponse);
          
          // 타이머가 실행 중이면 세션도 활성화된 것으로 간주
          if (timerResponse && timerResponse.timerStatus === "RUNNING") {
            setIsSessionActive(true);
          }
        } catch (timerError: any) {
          console.warn("타이머 상태 로드 실패:", timerError);
        }

        clearTimeout(timeoutId);
        setLoading(false);

        toast({
          title: "입장 완료",
          description: `${roomData.roomName}에 입장했습니다.`,
        });
      } catch (error: any) {
        console.error("Failed to join room:", error);
        clearTimeout(timeoutId);
        setLoading(false);
        setError(error?.message || "방 입장에 실패했습니다.");
        toast({
          title: "입장 실패",
          description: error?.message || "방 입장에 실패했습니다.",
          variant: "destructive",
        });
        setTimeout(() => {
          navigate("/group-study");
        }, 3000);
      }
    };

    joinRoom();

    // ✅ cleanup 함수 개선
    return () => {
      clearTimeout(timeoutId);
      
      // 컴포넌트 언마운트 시에만 WebSocket 정리
      // 방 나가기는 leaveRoom 함수에서 처리
      console.log("🧹 Cleaning up room join effect");
    };
  }, [user, roomId, navigate]);

  // 브라우저 이벤트 처리
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (roomId && hasJoinedRef.current && !isLeavingRef.current && user?.id) {
        isLeavingRef.current = true;

        const baseURL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

        // WebSocket 정리
        webSocketService.unsubscribe(Number(roomId), "GROUP");
        webSocketService.disconnect(true); // ✅ 재연결 차단

        // 방 나가기만 호출 (백엔드에서 세션/타이머 자동 종료)
        const url = `${baseURL}/api/study-rooms/${roomId}/leave?memberId=${user.id}`;
        fetch(url, {
          method: "POST",
          credentials: "include",
          keepalive: true,
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${localStorage.getItem("authToken")}`
          },
        }).catch((err) => console.error("Failed to leave room:", err));
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [roomId, user]);

  // 참여자 새로고침 (5초마다)
  useEffect(() => {
    if (!roomId || !roomInfo) return;

    const refresh = async () => {
      try {
        const pList = await studyRoomAPI.getParticipants(roomId);
        console.log("🔄 Participants count:", pList.length);
        
        if (Array.isArray(pList)) {
          const participantList = pList.map((p: any) => ({
            memberId: p.memberId,
            username: p.memberId === roomInfo.creatorId ? roomInfo.creatorUsername : `사용자${p.memberId}`,
            profileImageUrl: undefined,
            joinedAt: p.joinedAt,
          }));
          
          setParticipants(participantList as any);
        }
      } catch (e) {
        console.error("Failed to refresh participants:", e);
      }
    };

    // 즉시 한 번 실행
    refresh();

    // 5초마다 새로고침
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [roomId, roomInfo]);

  // ==========================================
  // JSX 렌더링
  // ==========================================

  if (!user) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600 mb-4">로그인이 필요합니다.</p>
          <Button onClick={() => navigate("/login")}>로그인하기</Button>
        </div>
      </div>
    );
  }

  if (!roomId) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600 mb-4">방 ID가 없습니다.</p>
          <Button onClick={() => navigate("/group-study")}>
            그룹 스터디로 돌아가기
          </Button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            오류가 발생했습니다
          </h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <div className="space-x-3">
            <Button onClick={() => navigate("/group-study")}>
              그룹 스터디로 돌아가기
            </Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              새로고침
            </Button>
          </div>
          <p className="text-xs text-gray-400 mt-4">
            3초 후 자동으로 그룹 스터디 페이지로 이동합니다...
          </p>
        </div>
      </div>
    );
  }

  if (loading || !roomInfo) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600 mb-2">스터디룸에 입장하는 중...</p>
          <p className="text-xs text-gray-400">잠시만 기다려주세요</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h1 className="text-2xl font-bold text-gray-900">
            {roomInfo.roomName}
          </h1>
          <Badge variant="secondary">{roomInfo.studyField}</Badge>

          {/* 참여자 수 팝오버 */}
          <Popover>
            <PopoverTrigger asChild>
              <button className="flex items-center text-gray-600 hover:text-gray-900 transition-colors cursor-pointer">
                <Users className="w-4 h-4 mr-2" />
                <span className="font-medium">
                  {participants.length}/{roomInfo.maxMembers}
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-sm text-gray-900">
                    👥 참여자 목록
                  </h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={refreshParticipants}
                    className="h-7 w-7 p-0"
                    title="새로고침"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                    </svg>
                  </Button>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {participants.map((participant) => (
                    <div
                      key={participant.memberId}
                      className={`flex items-center space-x-3 p-2 rounded-lg ${
                        participant.memberId === roomInfo.creatorId
                          ? "bg-yellow-50 border border-yellow-200"
                          : participant.username === user?.username
                          ? "bg-indigo-50 border border-indigo-200"
                          : "bg-gray-50"
                      }`}
                    >
                      <Avatar className="w-8 h-8">
                        {participant.profileImageUrl ? (
                          <AvatarImage src={participant.profileImageUrl} />
                        ) : null}
                        <AvatarFallback
                          className={
                            participant.memberId === roomInfo.creatorId
                              ? "bg-yellow-500 text-white"
                              : participant.memberId === Number(user?.id)
                              ? "bg-indigo-500 text-white"
                              : "bg-gray-400 text-white"
                          }
                        >
                          {participant.username?.charAt(0)?.toUpperCase() || "U"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {participant.username || `사용자${participant.memberId}`}
                          </span>
                          {participant.memberId === roomInfo.creatorId && (
                            <Badge
                              variant="secondary"
                              className="text-xs bg-yellow-100"
                            >
                              방장
                            </Badge>
                          )}
                          {participant.memberId === Number(user?.id) &&
                            participant.memberId !== roomInfo.creatorId && (
                              <Badge variant="secondary" className="text-xs">
                                나
                              </Badge>
                            )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {roomInfo.remainingMinutes && roomInfo.remainingMinutes > 0 && (
            <div className="flex items-center text-sm text-gray-600">
              <Clock className="w-4 h-4 mr-1" />
              <span>남은 시간: {roomInfo.remainingMinutes}분</span>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setInviteDialogOpen(true)}
          >
            <Users className="w-4 h-4 mr-2" />
            초대
          </Button>
          
          {/* 방장 전용: 방 삭제 버튼 (항상 표시, 백엔드에서 검증) */}
          {roomInfo.creatorId === Number(user?.id) && (
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-300"
              onClick={async () => {
                if (participants.length > 1) {
                  toast({
                    title: "삭제 불가",
                    description: "다른 멤버가 방에 있을 때는 삭제할 수 없습니다. 모든 멤버가 나간 후 삭제해주세요.",
                    variant: "destructive",
                  });
                  return;
                }
                
                if (confirm("정말로 이 방을 삭제하시겠습니까?\n\n⚠️ 삭제 후에는 복구할 수 없으며, 세션 기록이 저장됩니다.")) {
                  await deleteRoom();
                }
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mr-2"
              >
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
              방 삭제
            </Button>
          )}
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExitDialogOpen(true)}
          >
            <LogOut className="w-4 h-4 mr-2" />
            나가기
          </Button>
        </div>
      </div>

      {/* 메인 컨텐츠 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 왼쪽: 채팅 */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* 상태 전환 + 타이머 */}
          <div className="border-b bg-white p-4">
            <div className="flex items-center gap-4">
              <Button
                variant={myStatus === "studying" ? "default" : "outline"}
                className={
                  myStatus === "studying"
                    ? "bg-green-500 hover:bg-green-600"
                    : ""
                }
                onClick={() => handleStatusToggle("studying")}
              >
                <BookOpen className="w-4 h-4 mr-2" />
                공부중
              </Button>
              <Button
                variant={myStatus === "resting" ? "default" : "outline"}
                className={
                  myStatus === "resting"
                    ? "bg-orange-500 hover:bg-orange-600"
                    : ""
                }
                onClick={() => handleStatusToggle("resting")}
              >
                <Coffee className="w-4 h-4 mr-2" />
                휴식중
              </Button>

              <div className="flex items-center gap-3 ml-4 px-4 py-2 bg-gray-100 rounded-lg">
                <Clock className="w-5 h-5 text-gray-600" />
                <div className="flex items-center gap-2">
                  <span
                    className={`text-2xl font-bold tabular-nums ${
                      myStatus === "studying"
                        ? "text-green-600"
                        : "text-gray-400"
                    }`}
                  >
                    {formatTime(currentSeconds)}
                  </span>
                  {myStatus === "studying" ? (
                    <span className="flex items-center text-xs text-green-600">
                      <Play className="w-3 h-3 mr-1" />
                      진행중
                    </span>
                  ) : (
                    <span className="flex items-center text-xs text-orange-500">
                      <Pause className="w-3 h-3 mr-1" />
                      일시정지
                    </span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCurrentSeconds(0);
                    toast({
                      title: "타이머 리셋",
                      description: "타이머가 00:00으로 초기화되었습니다.",
                    });
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  리셋
                </Button>
              </div>

              {/* 뽀모도로 타이머 */}
              <div className="flex items-center gap-5 ml-4 px-5 py-3 bg-white rounded-xl border border-red-100 shadow-md hover:shadow-lg transition-all duration-200">
                <div className="flex flex-col items-center">
                  <span className="text-base font-semibold text-red-600 whitespace-nowrap tracking-wide uppercase">Pomodoro</span>
                  <span className="text-xs text-gray-500 font-normal">뽀모도로</span>
                </div>
                
                <div className="h-8 w-px bg-gradient-to-b from-transparent via-red-200 to-transparent"></div>
                
                <div className="flex items-center gap-2">
                  <span className={`text-2xl font-mono font-semibold tabular-nums ${
                    pomodoroIsRunning
                      ? pomodoroMode === "work" ? "text-red-600" : "text-blue-500"
                      : "text-gray-400"
                  }`}>
                    {formatTime(pomodoroTime)}
                  </span>
                </div>
                
                <div className="flex items-center gap-2">
                  <Badge 
                    variant="secondary" 
                    className={`text-xs font-medium px-2.5 py-1 whitespace-nowrap ${
                      pomodoroMode === "work" 
                        ? "bg-red-100 text-red-700 border border-red-200" 
                        : pomodoroMode === "shortBreak"
                        ? "bg-blue-100 text-blue-700 border border-blue-200"
                        : "bg-green-100 text-green-700 border border-green-200"
                    }`}
                  >
                    {pomodoroMode === "work" ? "작업" : pomodoroMode === "shortBreak" ? "짧은 휴식" : "긴 휴식"}
                  </Badge>
                  <Badge variant="outline" className="text-xs font-medium px-2.5 py-1 border-gray-300 text-gray-600 bg-gray-50">
                    {pomodoroCycle}/4
                  </Badge>
                </div>
                
                <div className="h-8 w-px bg-gradient-to-b from-transparent via-gray-200 to-transparent"></div>
                
                <div className="flex items-center gap-1.5">
                  {pomodoroIsRunning ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handlePomodoroPause}
                      className="h-9 w-9 p-0 rounded-lg hover:bg-red-50 transition-colors"
                      title="일시정지"
                    >
                      <Pause className="w-4 h-4 text-red-600" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handlePomodoroStart}
                      className="h-9 w-9 p-0 rounded-lg hover:bg-red-50 transition-colors"
                      title="시작"
                    >
                      <Play className="w-4 h-4 text-red-600" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handlePomodoroReset}
                    className="h-9 w-9 p-0 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
                    title="리셋"
                  >
                    <Clock className="w-4 h-4" />
                  </Button>
                </div>
                
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 text-xs border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 whitespace-nowrap transition-colors"
                    >
                      모드 변경
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-3 shadow-xl border-gray-200">
                    <div className="space-y-1.5">
                      <div className="text-xs font-semibold text-gray-600 mb-3 px-1">Pomodoro Mode</div>
                      <Button
                        variant={pomodoroMode === "work" ? "default" : "ghost"}
                        size="sm"
                        className={`w-full justify-start transition-all ${
                          pomodoroMode === "work"
                            ? "bg-red-50 hover:bg-red-100 text-red-700 border border-red-200"
                            : "hover:bg-gray-50"
                        }`}
                        onClick={() => handlePomodoroModeChange("work")}
                      >
                        <span className="mr-2">📚</span>
                        작업 (25분)
                      </Button>
                      <Button
                        variant={pomodoroMode === "shortBreak" ? "default" : "ghost"}
                        size="sm"
                        className={`w-full justify-start transition-all ${
                          pomodoroMode === "shortBreak"
                            ? "bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200"
                            : "hover:bg-gray-50"
                        }`}
                        onClick={() => handlePomodoroModeChange("shortBreak")}
                      >
                        <span className="mr-2">☕</span>
                        짧은 휴식 (5분)
                      </Button>
                      <Button
                        variant={pomodoroMode === "longBreak" ? "default" : "ghost"}
                        size="sm"
                        className={`w-full justify-start transition-all ${
                          pomodoroMode === "longBreak"
                            ? "bg-green-50 hover:bg-green-100 text-green-700 border border-green-200"
                            : "hover:bg-gray-50"
                        }`}
                        onClick={() => handlePomodoroModeChange("longBreak")}
                      >
                        <span className="mr-2">🌴</span>
                        긴 휴식 (15분)
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="ml-auto flex items-center gap-4 text-sm text-gray-600">
                {levelInfo && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-indigo-50 to-sky-50 rounded-lg border border-indigo-200">
                    <span className="font-semibold text-indigo-700">
                      레벨 {levelInfo.currentLevel}
                    </span>
                    <span className="text-xs text-gray-600">
                      ({Math.round(levelInfo.progress)}%)
                    </span>
                  </div>
                )}
                {messages.filter(
                  (m) => m.type === "question" && m.status !== "resolved"
                ).length > 0 && (
                  <Popover
                    open={questionListOpen}
                    onOpenChange={setQuestionListOpen}
                  >
                    <PopoverTrigger asChild>
                      <button className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-red-50 to-orange-50 rounded-lg border border-red-200 hover:shadow-md transition-all cursor-pointer">
                        <HelpCircle className="w-4 h-4 text-red-500" />
                        <span className="font-semibold text-red-700">
                          질문{" "}
                          {
                            messages.filter(
                              (m) =>
                                m.type === "question" && m.status !== "resolved"
                            ).length
                          }
                          개
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-96 p-4 max-h-[500px] overflow-y-auto">
                      <div className="space-y-3">
                        <h4 className="font-semibold text-sm text-gray-900 flex items-center gap-2">
                          <HelpCircle className="w-4 h-4 text-red-500" />
                          미해결 질문 목록
                        </h4>
                        <div className="space-y-2">
                          {messages
                            .filter(
                              (m) =>
                                m.type === "question" && m.status !== "resolved"
                            )
                            .map((question) => (
                              <div
                                key={question.id}
                                className="p-3 bg-red-50 rounded-lg border border-red-200 hover:bg-red-100 cursor-pointer transition-colors"
                                onClick={() => scrollToQuestion(question.id)}
                              >
                                <div className="flex items-start justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <Avatar className="w-6 h-6">
                                      <AvatarFallback className="bg-red-500 text-white text-xs">
                                        {question.sender
                                          ?.charAt(0)
                                          .toUpperCase()}
                                      </AvatarFallback>
                                    </Avatar>
                                    <span className="font-medium text-sm">
                                      {question.sender}
                                    </span>
                                  </div>
                                  <Badge
                                    variant={
                                      question.status === "helping"
                                        ? "default"
                                        : "destructive"
                                    }
                                    className="text-xs"
                                  >
                                    {question.status === "helping"
                                      ? "답변 중"
                                      : "도움 필요"}
                                  </Badge>
                                </div>
                                <p className="text-sm text-gray-800 line-clamp-2 mb-1">
                                  "{question.content}"
                                </p>
                                {question.answers &&
                                  question.answers.length > 0 && (
                                    <div className="flex items-center gap-1 text-xs text-blue-600">
                                      <MessageCircle className="w-3 h-3" />
                                      <span>
                                        답변 {question.answers.length}개
                                      </span>
                                    </div>
                                  )}
                                <span className="text-xs text-gray-500">
                                  {formatRelativeTime(question.timestamp)}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
                <div className="flex items-center gap-1">
                  <TrendingUp className="w-4 h-4 text-green-500" />
                  <span>총 {formatTime(currentSeconds)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 채팅 메시지 */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.length === 0 && (
              <div className="text-center text-gray-500 py-8">
                <p>아직 메시지가 없습니다.</p>
                <p className="text-sm">첫 번째 메시지를 보내보세요!</p>
              </div>
            )}
            {messages.map((message) => (
              <div key={message.id}>
                {message.type === "system" ? (
                  <div className="text-center text-sm text-gray-500 py-2">
                    {message.content}
                  </div>
                ) : message.type === "question" ? (
                  <div
                    id={`question-${message.id}`}
                    className="bg-gradient-to-r from-red-50 to-orange-50 rounded-lg p-4 border-l-4 border-red-500 space-y-3 transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-2">
                        <Avatar className="w-8 h-8">
                          <AvatarFallback className="bg-red-500 text-white">
                            {message.sender?.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">
                              {message.sender}
                            </span>
                            <Badge
                              variant={
                                message.status === "resolved"
                                  ? "secondary"
                                  : message.status === "helping"
                                  ? "default"
                                  : "destructive"
                              }
                              className="text-xs"
                            >
                              {message.status === "resolved"
                                ? "해결됨 ✓"
                                : message.status === "helping"
                                ? "답변 중"
                                : "도움 필요"}
                            </Badge>
                          </div>
                          <span className="text-xs text-gray-500">
                            {message.timestamp.toLocaleTimeString("ko-KR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      </div>
                      {message.sender === user?.username && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleDeleteQuestion(message.id)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>

                    <div className="bg-white rounded-lg p-3 shadow-sm">
                      <div className="flex items-start gap-2">
                        <HelpCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                        <p className="text-gray-900 flex-1">
                          {message.content}
                        </p>
                      </div>
                    </div>

                    {message.imageUrl && (
                      <div className="bg-white rounded-lg p-2">
                        <img
                          src={message.imageUrl}
                          alt="질문 첨부"
                          className="max-w-sm rounded cursor-pointer hover:opacity-90"
                          onClick={() => window.open(message.imageUrl)}
                        />
                      </div>
                    )}

                    {message.status === "resolved" &&
                      message.answers &&
                      message.answers.some((ans) => ans.isAccepted) && (
                        <div className="pl-7 space-y-2">
                          <div className="flex items-center gap-2 text-sm font-medium text-green-700">
                            <CheckCircle className="w-4 h-4" />
                            <span>채택된 답변</span>
                          </div>
                          {message.answers
                            .filter((ans) => ans.isAccepted)
                            .map((answer) => (
                              <div
                                key={answer.id}
                                className="bg-green-50 rounded-lg p-3 border-2 border-green-300 shadow-sm"
                              >
                                <div className="flex items-center gap-2 mb-2">
                                  <Avatar className="w-6 h-6">
                                    <AvatarFallback className="bg-green-500 text-white text-xs">
                                      {answer.answerer.charAt(0).toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="font-medium text-sm">
                                    {answer.answerer}
                                  </span>
                                  <Badge
                                    variant="secondary"
                                    className="text-xs bg-green-100 text-green-700"
                                  >
                                    채택됨 ✓
                                  </Badge>
                                  <span className="text-xs text-gray-500">
                                    {formatRelativeTime(answer.timestamp)}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-800 pl-8">
                                  {answer.content}
                                </p>
                              </div>
                            ))}
                        </div>
                      )}

                    {message.status !== "resolved" &&
                      message.answers &&
                      message.answers.length > 0 && (
                        <div className="space-y-2 pl-7">
                          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                            <MessageCircle className="w-4 h-4" />
                            <span>답변 {message.answers.length}개</span>
                          </div>
                          {message.answers.map((answer) => (
                            <div
                              key={answer.id}
                              className="bg-blue-50 rounded-lg p-3 border border-blue-200"
                            >
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2">
                                  <Avatar className="w-6 h-6">
                                    <AvatarFallback className="bg-blue-500 text-white text-xs">
                                      {answer.answerer.charAt(0).toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="font-medium text-sm">
                                    {answer.answerer}
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    {formatRelativeTime(answer.timestamp)}
                                  </span>
                                </div>
                                {message.sender === user?.username && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                                    onClick={() =>
                                      handleAcceptAnswer(message.id, answer.id)
                                    }
                                  >
                                    <CheckCircle className="w-4 h-4 mr-1" />
                                    채택
                                  </Button>
                                )}
                              </div>
                              <p className="text-sm text-gray-800 pl-8">
                                {answer.content}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}

                    {message.status !== "resolved" && (
                      <div className="pl-7 flex gap-2">
                        <Input
                          placeholder="답변을 입력하세요..."
                          value={answerInputs[message.id] || ""}
                          onChange={(e) =>
                            setAnswerInputs((prev) => ({
                              ...prev,
                              [message.id]: e.target.value,
                            }))
                          }
                          onKeyPress={(e) =>
                            e.key === "Enter" && handleSubmitAnswer(message.id)
                          }
                          className="flex-1 bg-white"
                        />
                        <Button
                          size="sm"
                          onClick={() => handleSubmitAnswer(message.id)}
                          disabled={!answerInputs[message.id]?.trim()}
                        >
                          <Send className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-start space-x-3">
                    <Avatar className="w-8 h-8">
                      <AvatarFallback>
                        {message.sender?.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="font-medium text-sm">
                          {message.sender}
                        </span>
                        <span className="text-xs text-gray-500">
                          {message.timestamp.toLocaleTimeString("ko-KR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <div className="bg-white rounded-lg px-4 py-2 shadow-sm">
                        <p className="text-gray-900">{message.content}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* 채팅 입력 */}
          <div className="border-t bg-white p-4">
            {isQuestionMode && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                  <span className="text-sm font-medium text-red-700">
                    질문 모드
                  </span>
                  {questionImage && (
                    <Badge variant="secondary" className="text-xs">
                      이미지 첨부됨
                    </Badge>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsQuestionMode(false);
                    setQuestionImage(null);
                    setQuestionFileName(null);
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}

            <div className="flex items-center space-x-2">
              <input
                type="file"
                className="hidden"
                accept="image/*"
                onChange={handleImageUpload}
                id="image-upload"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => document.getElementById("image-upload")?.click()}
              >
                <ImageIcon className="w-5 h-5" />
              </Button>
              <Button
                variant={isQuestionMode ? "default" : "ghost"}
                size="sm"
                className={isQuestionMode ? "bg-red-500 hover:bg-red-600" : ""}
                onClick={() => setIsQuestionMode(!isQuestionMode)}
              >
                <HelpCircle className="w-5 h-5" />
              </Button>
              <Input
                placeholder={
                  isQuestionMode
                    ? "질문 내용을 입력하세요..."
                    : "메시지를 입력하세요..."
                }
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
                className="flex-1"
              />
              <Button onClick={handleSendMessage}>
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* 초대 다이얼로그 */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>🎉 친구 초대하기</DialogTitle>
            <DialogDescription>
              친구들을 초대하여 함께 공부하세요!
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium mb-2">초대 링크</Label>
              <div className="flex space-x-2">
                <Input
                  readOnly
                  value={`${window.location.origin}/#/group-study/room/${roomId}`}
                  className="flex-1"
                />
                <Button onClick={handleCopyInviteLink}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 나가기 다이얼로그 */}
      <Dialog open={exitDialogOpen} onOpenChange={setExitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>스터디룸 나가기</DialogTitle>
            <DialogDescription>
              정말로 스터디룸을 나가시겠습니까?
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setExitDialogOpen(false)}>
              취소
            </Button>
            <Button variant="destructive" onClick={handleExitRoom}>
              나가기
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GroupStudyRoomPage;