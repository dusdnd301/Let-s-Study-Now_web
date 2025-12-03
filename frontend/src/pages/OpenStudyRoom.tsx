import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
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
  openStudyAPI, 
  OpenStudyRoom, 
  sessionAPI, 
  SessionStartRequestDto,
  SessionEndResultDto,
  LevelInfoDto,
  chatAPI,
  ChatMessage as APIChatMessage,
} from "@/lib/api";
import {
  webSocketService,
  WebSocketMessage,
  MessageType,
} from "@/lib/websocket";
import {
  Users,
  Clock,
  Send,
  Paperclip,
  Image as ImageIcon,
  Download,
  LogOut,
  Play,
  Pause,
  Copy,
  TrendingUp,
  BookOpen,
  Coffee,
  HelpCircle,
  MessageCircle,
  X,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

interface ChatMessage {
  id: number;
  type: MessageType;
  sender: string;
  senderId?: number;
  senderProfileImage?: string;
  content: string;
  imageUrl?: string;
  fileName?: string;
  fileSize?: number;
  timestamp: Date;
  answers?: HelpAnswer[];
  status?: "open" | "helping" | "resolved";
  refId?: number;
  isSolved?: boolean;
}

interface Participant {
  id: string;
  username: string;
  status: "studying" | "resting";
  isCreator: boolean;
}

interface HelpAnswer {
  id: number;
  answerer: string;
  answererId?: number;
  answererProfileImage?: string;
  content: string;
  timestamp: Date;
  isAccepted?: boolean;
}

const OpenStudyRoomPage: React.FC = () => {
  const { user } = useAuth();
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const helpFileInputRef = useRef<HTMLInputElement>(null);
  const hasJoinedRef = useRef(false);
  const isLeavingRef = useRef(false);

  // Room Info
  const [roomInfo, setRoomInfo] = useState<OpenStudyRoom | null>(null);
  const [loading, setLoading] = useState(true);

  // Chat
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState("");

  // My Status
  const [myStatus, setMyStatus] = useState<"studying" | "resting">("studying");

  // Session - 백엔드 연동
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [currentSeconds, setCurrentSeconds] = useState(0);
  const intervalRef = useRef<any>(null);
  
  // Level Info
  const [levelInfo, setLevelInfo] = useState<LevelInfoDto | null>(null);

  // Today's Stats
  const [todayStats, setTodayStats] = useState({
    totalStudyTime: 0,
    studySessions: 0,
    restSessions: 0,
  });

  // Participants
  const [participants, setParticipants] = useState<Participant[]>([]);

  // Question mode
  const [isQuestionMode, setIsQuestionMode] = useState(false);
  const [questionImage, setQuestionImage] = useState<string | null>(null);
  const [questionFileName, setQuestionFileName] = useState<string | null>(null);

  // Answer input for specific question
  const [answerInputs, setAnswerInputs] = useState<Record<number, string>>({});

  // Question list popover
  const [questionListOpen, setQuestionListOpen] = useState(false);

  // Dialogs
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [exitDialogOpen, setExitDialogOpen] = useState(false);

  // 시간 포맷 함수
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

  // 상대적 시간 표시
  const formatRelativeTime = (date: Date) => {
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diff < 60) return "방금 전";
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
    return `${Math.floor(diff / 86400)}일 전`;
  };

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

  // 타이머 실시간 UI 업데이트 - myStatus에 따라 작동
  useEffect(() => {
    // 기존 interval 정리
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // ✅ "공부중" 상태일 때만 타이머 시작
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

// ✅ WebSocket 메시지 수신 처리
const handleWebSocketMessage = (wsMessage: WebSocketMessage) => {
  console.log("📩 WebSocket message received:", wsMessage);

  // ✅ id 또는 messageId 사용
  const messageId = wsMessage.id || wsMessage.messageId || 0;

  const newMessage: ChatMessage = {
    id: messageId,  // ✅ 둘 중 하나 사용
    type: wsMessage.type,
    sender: wsMessage.sender,
    senderId: undefined,
    senderProfileImage: undefined,
    content: wsMessage.message,
    imageUrl: wsMessage.imageUrl,
    timestamp: new Date(wsMessage.sentAt),
    refId: wsMessage.refId,
    isSolved: wsMessage.isSolved,
  };

  if (wsMessage.type === "QUESTION") {
    newMessage.status = "open";
    newMessage.answers = [];
    console.log("➕ Adding QUESTION message:", newMessage);
    setMessages((prev) => [...prev, newMessage]);
    
  } else if (wsMessage.type === "ANSWER") {
    console.log("💬 ANSWER received:", {
      id: messageId,
      refId: wsMessage.refId,
      sender: wsMessage.sender,
      message: wsMessage.message,
    });

    if (!wsMessage.refId) {
      console.error("❌ ANSWER has no refId!");
      return;
    }

    setMessages((prev) => {
      const updated = prev.map((msg) => {
        if (msg.id === wsMessage.refId && msg.type === "QUESTION") {
          console.log("✅ Found matching QUESTION:", msg.id);

          const newAnswer: HelpAnswer = {
            id: messageId,  // ✅ 수정
            answerer: wsMessage.sender,
            answererId: undefined,
            answererProfileImage: undefined,
            content: wsMessage.message,
            timestamp: new Date(wsMessage.sentAt),
            isAccepted: false,
          };

          console.log("➕ Adding answer to question:", newAnswer);

          return {
            ...msg,
            answers: [...(msg.answers || []), newAnswer],
            status: "helping" as const,
          };
        }
        return msg;
      });

      console.log("📦 Updated messages:", updated);
      return updated;
    });
    
  } else if (wsMessage.type === "SOLVE") {
    console.log("✅ SOLVE message received:", wsMessage);

    if (wsMessage.refId) {
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id === wsMessage.refId && msg.type === "QUESTION") {
            console.log("✅ Marking question as SOLVED:", msg.id);
            return {
              ...msg,
              status: "resolved" as const,
              isSolved: true,
            };
          }
          return msg;
        })
      );
    }
    
    addSystemMessage(wsMessage.message);
    
  } else if (wsMessage.type === "SYSTEM") {
    addSystemMessage(wsMessage.message);
    
  } else {
    console.log("➕ Adding TALK message:", newMessage);
    setMessages((prev) => [...prev, newMessage]);
  }
};

  // ✅ 채팅 내역 불러오기
const loadChatHistory = async (roomIdNum: number) => {
  try {
    const response = await chatAPI.getChatHistory(roomIdNum, "OPEN", 0);
    
    console.log("📦 Chat history response:", response);
    
    // ✅ 배열로 직접 반환됨
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
    const loadedMessages: ChatMessage[] = response.map((apiMsg) => {
      const baseMessage: ChatMessage = {
        id: apiMsg.id,  // ✅ id 사용
        type: apiMsg.type,
        sender: apiMsg.sender,
        senderId: undefined,
        senderProfileImage: undefined,
        content: apiMsg.message,
        imageUrl: apiMsg.imageUrl,
        timestamp: new Date(apiMsg.sentAt),  // ✅ sentAt 사용
        refId: apiMsg.refId,
        isSolved: apiMsg.isSolved,
      };

      if (apiMsg.type === "QUESTION") {
        baseMessage.status = apiMsg.isSolved ? "resolved" : "open";
        baseMessage.answers = [];
      }

      return baseMessage;
    });

    // 답변 메시지들을 해당 질문에 연결
    loadedMessages.forEach((msg) => {
      if (msg.type === "ANSWER" && msg.refId) {
        const questionMsg = loadedMessages.find(
          (m) => m.id === msg.refId && m.type === "QUESTION"
        );
        if (questionMsg) {
          const answer: HelpAnswer = {
            id: msg.id,
            answerer: msg.sender,
            answererId: undefined,
            answererProfileImage: undefined,
            content: msg.content,
            timestamp: msg.timestamp,
          };
          if (!questionMsg.answers) questionMsg.answers = [];
          questionMsg.answers.push(answer);
          if (questionMsg.answers.length > 0 && !questionMsg.isSolved) {
            questionMsg.status = "helping";
          }
        }
      }
    });

    // ANSWER 타입 제외
    const filteredMessages = loadedMessages.filter(
      (msg) => msg.type !== "ANSWER"
    );

    setMessages(filteredMessages);
    console.log("✅ Chat history loaded:", filteredMessages.length, "messages");
  } catch (error) {
    console.error("❌ Failed to load chat history:", error);
    setMessages([]);
  }
};

  // ✅ 방 입장 및 WebSocket 연결
  useEffect(() => {
    if (!user || !roomId || hasJoinedRef.current) return;

    const joinRoom = async () => {
      try {
        setLoading(true);
        console.log("Attempting to join room:", roomId);

        let roomData: OpenStudyRoom;
        try {
          roomData = await openStudyAPI.getRoom(roomId);
          console.log("Room data loaded:", roomData);
          setRoomInfo(roomData);

          setParticipants([
            {
              id: "creator",
              username: roomData.creatorUsername || "방장",
              status: "studying",
              isCreator: true,
            },
          ]);
        } catch (error: any) {
          console.error("Failed to get room info:", error);
          toast({
            title: "오류",
            description: "방 정보를 불러올 수 없습니다.",
            variant: "destructive",
          });
          navigate("/open-study");
          return;
        }

        const isCreator =
          roomData.creatorUsername === user.username ||
          (roomData.createdBy && roomData.createdBy === user.id);

        if (!isCreator) {
          try {
            await openStudyAPI.joinRoom(roomId);
            console.log("Successfully joined room via API");
          } catch (joinError: any) {
            if (
              joinError?.message?.includes("이미") ||
              joinError?.message?.includes("already") ||
              joinError?.message?.includes("409")
            ) {
              console.log("Already in room, continuing...");
            } else {
              throw joinError;
            }
          }
        } else {
          console.log("Room creator, skipping joinRoom call");
        }

        // ✅ WebSocket 연결
        webSocketService.connect(
          () => {
            console.log("WebSocket connected successfully");
            const roomIdNum = parseInt(roomId, 10);
            
            // 채팅 내역 불러오기
            loadChatHistory(roomIdNum);
            
            // 구독 시작
            webSocketService.subscribe(roomIdNum, "OPEN", handleWebSocketMessage);
          },
          (error) => {
            console.error("WebSocket connection failed:", error);
            toast({
              title: "연결 오류",
              description: "채팅 서버 연결에 실패했습니다.",
              variant: "destructive",
            });
          }
        );

        // ✅ 스터디 세션 시작
        try {
          const roomIdNum = parseInt(roomId, 10);
          if (!isNaN(roomIdNum)) {
            console.log("Starting session...");
            const sessionResponse = await sessionAPI.startSession({
              studyType: "OPEN_STUDY",
              roomId: roomIdNum,
            });
            console.log("Session started:", sessionResponse);

            setSessionId(sessionResponse.sessionId);
            setIsSessionActive(true);
            setCurrentSeconds(0);
          }
        } catch (sessionError: any) {
          console.error("Failed to start session:", sessionError);
        }

        localStorage.setItem("currentOpenStudyRoom", roomId);
        hasJoinedRef.current = true;

        if (roomData.creatorUsername !== user.username) {
          setParticipants((prev) => [
            ...prev,
            {
              id: user.id?.toString() || "me",
              username: user.username,
              status: "studying",
              isCreator: false,
            },
          ]);
        }

        toast({
          title: "입장 완료",
          description: `${roomData.title}에 입장했습니다.`,
        });

        setLoading(false);
      } catch (error: any) {
        console.error("Failed to join room:", error);

        toast({
          title: "입장 실패",
          description: error?.message || "방 입장에 실패했습니다.",
          variant: "destructive",
        });

        localStorage.removeItem("currentOpenStudyRoom");
        setLoading(false);
        navigate("/open-study");
      }
    };

    joinRoom();

    // Cleanup
    return () => {
      if (roomId && hasJoinedRef.current) {
        const roomIdNum = parseInt(roomId, 10);
        if (!isNaN(roomIdNum)) {
          webSocketService.unsubscribe(roomIdNum, "OPEN");
        }
        webSocketService.disconnect();
      }
    };
  }, [user, roomId, navigate]);

  

  // 브라우저 이벤트 처리
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (roomId && hasJoinedRef.current && !isLeavingRef.current) {
        isLeavingRef.current = true;
        localStorage.removeItem("currentOpenStudyRoom");

        const baseURL =
          import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";
        const url = `${baseURL}/api/open-study/rooms/${roomId}/leave`;

        fetch(url, {
          method: "POST",
          credentials: "include",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }).catch((err) => console.error("Failed to leave room:", err));
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (roomId && hasJoinedRef.current && !isLeavingRef.current) {
        leaveRoom();
      }
    };
  }, [roomId]);

  const leaveRoom = async () => {
    if (!roomId || isLeavingRef.current) return;
    isLeavingRef.current = true;

    try {
      localStorage.removeItem("currentOpenStudyRoom");
      await openStudyAPI.leaveRoom(roomId);
      hasJoinedRef.current = false;
    } catch (error) {
      console.error("Failed to leave room:", error);
      localStorage.removeItem("currentOpenStudyRoom");
      hasJoinedRef.current = false;
    }
  };

  const handleStatusToggle = (newStatus: "studying" | "resting") => {
    if (myStatus === newStatus) return;

    if (newStatus === "resting" && myStatus === "studying") {
      setTodayStats((prev) => ({
        ...prev,
        studySessions: prev.studySessions + 1,
      }));
      addSystemMessage(
        `${user?.username}님이 휴식 모드로 전환했습니다. (공부 시간: ${formatTime(
          currentSeconds
        )})`
      );
    } else if (newStatus === "studying" && myStatus === "resting") {
      setTodayStats((prev) => ({
        ...prev,
        restSessions: prev.restSessions + 1,
      }));
      addSystemMessage(`${user?.username}님이 공부 모드로 전환했습니다.`);
    }

    setMyStatus(newStatus);
    setParticipants((prev) =>
      prev.map((p) =>
        p.username === user?.username ? { ...p, status: newStatus } : p
      )
    );
  };

  const handleTimerReset = () => {
    setCurrentSeconds(0);
    toast({
      title: "타이머 리셋",
      description: "타이머가 00:00으로 초기화되었습니다.",
    });
  };

  // ✅ 메시지 전송 (WebSocket 사용)
  const handleSendMessage = async () => {
    if (!messageInput.trim() || !roomId) return;

    try {
      const roomIdNum = parseInt(roomId, 10);

      if (isQuestionMode) {
        // 이미지 업로드가 있으면 먼저 업로드
        let uploadedImageUrl: string | undefined;
        if (questionImage) {
          // questionImage는 현재 Blob URL이므로 실제 파일을 다시 가져와야 함
          // 실제 구현에서는 파일을 state로 관리하는 것이 좋음
          // 여기서는 간단히 처리
        }

        // 질문 메시지 전송
        webSocketService.sendMessage({
          type: "QUESTION",
          roomType: "OPEN",
          roomId: roomIdNum,
          message: messageInput,
        });

        setMessageInput("");
        setIsQuestionMode(false);
        setQuestionImage(null);
        setQuestionFileName(null);

        toast({
          title: "질문 등록",
          description: "질문이 등록되었습니다. 다른 참여자들이 답변해줄 거예요!",
        });
      } else {
        // 일반 텍스트 메시지 전송
        webSocketService.sendMessage({
          type: "TALK",
          roomType: "OPEN",
          roomId: roomIdNum,
          message: messageInput,
        });

        setMessageInput("");
      }
    } catch (error: any) {
      console.error("Failed to send message:", error);
      toast({
        title: "전송 실패",
        description: error?.message || "메시지 전송에 실패했습니다.",
        variant: "destructive",
      });
    }
  };

  const addSystemMessage = (content: string) => {
    const newMessage: ChatMessage = {
      id: Date.now(),
      type: "SYSTEM",
      sender: "SYSTEM",
      content,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, newMessage]);
  };

  // ✅ 이미지 업로드
const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;

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
      const imageUrl = await chatAPI.uploadImage(file);  // ✅ string 직접 반환
      
      if (roomId) {
        const roomIdNum = parseInt(roomId, 10);
        webSocketService.sendMessage({
          type: "TALK",
          roomType: "OPEN",
          roomId: roomIdNum,
          message: imageUrl,  // ✅ URL 직접 사용
        });
      }

      toast({
        title: "이미지 전송 완료",
        description: "이미지가 전송되었습니다.",
      });
    } catch (error: any) {
      console.error("Failed to upload image:", error);
      toast({
        title: "업로드 실패",
        description: error?.message || "이미지 업로드에 실패했습니다.",
        variant: "destructive",
      });
    }
  }
};

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      toast({
        title: "오류",
        description: "파일 크기는 50MB를 초과할 수 없습니다.",
        variant: "destructive",
      });
      return;
    }

    // TODO: 파일 업로드 API 구현 필요
    toast({
      title: "준비중",
      description: "파일 업로드 기능은 준비중입니다.",
    });
  };

// ✅ 답변 제출 (WebSocket 사용)
const handleSubmitAnswer = (questionId: number) => {
  console.log("🔍 handleSubmitAnswer called with questionId:", questionId);
  console.log("🔍 questionId type:", typeof questionId);
  
  const answerText = answerInputs[questionId];
  console.log("🔍 answerText:", answerText);
  console.log("🔍 answerInputs:", answerInputs);
  
  if (!answerText?.trim() || !roomId) {
    console.log("❌ Validation failed:", { answerText, roomId });
    return;
  }

  try {
    const roomIdNum = parseInt(roomId, 10);

    console.log("📤 Sending ANSWER with refId:", questionId);

    webSocketService.sendMessage({
      type: "ANSWER",
      roomType: "OPEN",
      roomId: roomIdNum,
      message: answerText,
      refId: questionId,
    });

    setAnswerInputs((prev) => ({ ...prev, [questionId]: "" }));

    toast({
      title: "답변 등록",
      description: "답변이 등록되었습니다!",
    });
  } catch (error: any) {
    console.error("Failed to submit answer:", error);
    toast({
      title: "전송 실패",
      description: error?.message || "답변 전송에 실패했습니다.",
      variant: "destructive",
    });
  }
};

// ✅ 답변 채택 (REST API 사용)
const handleAcceptAnswer = async (questionId: number, answerId: number) => {
  try {
    console.log("👑 Accepting answer:", { questionId, answerId });

    // ✅ REST API 호출
    await chatAPI.solveQuestion(questionId, answerId);

    // ✅ 로컬 상태 즉시 업데이트 (서버에서도 SOLVE 메시지 보내지만 UI 즉시 반영)
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === questionId && msg.type === "QUESTION"
          ? {
              ...msg,
              answers: msg.answers?.map((ans) =>
                ans.id === answerId ? { ...ans, isAccepted: true } : ans
              ),
              status: "resolved" as const,
              isSolved: true,
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
  const scrollToQuestion = (questionId: number) => {
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

// ✅ 질문 삭제 (REST API 사용)
const handleDeleteQuestion = async (questionId: number) => {
  try {
    console.log("🗑️ Deleting question:", questionId);
    
    await chatAPI.deleteMessage(questionId);

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

  const handleCopyInviteLink = () => {
    const inviteLink = `${window.location.origin}/#/open-study/room/${roomId}`;
    navigator.clipboard.writeText(inviteLink);
    toast({
      title: "초대 링크 복사 완료",
      description: "초대 링크가 클립보드에 복사되었습니다.",
    });
  };

  const handleExitRoom = async () => {
    if (!roomId || !roomInfo) return;

    const isCreator =
      user &&
      (roomInfo.createdBy === user.id ||
        roomInfo.creatorUsername === user.username);

    if (isCreator) {
      const confirmDelete = confirm(
        "방장이 나가면 방이 삭제됩니다.\n정말로 방을 나가시겠습니까?"
      );

      if (!confirmDelete) {
        setExitDialogOpen(false);
        return;
      }
    }

    // ✅ 스터디 세션 종료
    if (sessionId !== null) {
      try {
        const endResult = await sessionAPI.endSession(sessionId);
        console.log("Session ended successfully:", endResult);

        if (endResult.leveledUp && endResult.newLevel !== null) {
          toast({
            title: "🎉 레벨업!",
            description: `축하합니다! 레벨 ${endResult.newLevel}이 되었습니다!`,
          });
        }

        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        setCurrentSeconds(0);
        setSessionId(null);
        setIsSessionActive(false);
      } catch (sessionError: any) {
        console.error("Failed to end session:", sessionError);
      }
    }

    // WebSocket 연결 해제
    if (roomId) {
      const roomIdNum = parseInt(roomId, 10);
      if (!isNaN(roomIdNum)) {
        webSocketService.unsubscribe(roomIdNum, "OPEN");
      }
    }
    webSocketService.disconnect();

    await leaveRoom();
    toast({
      title: isCreator ? "방 삭제 완료" : "방 나가기 완료",
      description: isCreator
        ? "스터디 방이 삭제되었습니다."
        : "스터디룸에서 나왔습니다.",
    });

    setExitDialogOpen(false);
    navigate("/open-study");
  };

  if (loading || !roomInfo) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">스터디룸에 입장하는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h1 className="text-2xl font-bold text-gray-900">{roomInfo.title}</h1>
          <Badge variant="secondary">{roomInfo.studyField}</Badge>

          {/* 참여자 수 팝오버 */}
          <Popover>
            <PopoverTrigger asChild>
              <button className="flex items-center text-gray-600 hover:text-gray-900 transition-colors cursor-pointer">
                <Users className="w-4 h-4 mr-2" />
                <span className="font-medium">
                  {participants.length}/{roomInfo.maxParticipants}
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-4">
              <div className="space-y-3">
                <h4 className="font-semibold text-sm text-gray-900">
                  👥 참여자 목록
                </h4>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {participants.map((participant) => (
                    <div
                      key={participant.id}
                      className={`flex items-center space-x-3 p-2 rounded-lg ${
                        participant.isCreator
                          ? "bg-yellow-50 border border-yellow-200"
                          : participant.username === user?.username
                          ? "bg-indigo-50 border border-indigo-200"
                          : "bg-gray-50"
                      }`}
                    >
                      <Avatar className="w-8 h-8">
                        <AvatarFallback
                          className={
                            participant.isCreator
                              ? "bg-yellow-500 text-white"
                              : participant.username === user?.username
                              ? "bg-indigo-500 text-white"
                              : "bg-gray-400 text-white"
                          }
                        >
                          {participant.username.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {participant.username}
                          </span>
                          {participant.isCreator && (
                            <Badge
                              variant="secondary"
                              className="text-xs bg-yellow-100"
                            >
                              방장
                            </Badge>
                          )}
                          {participant.username === user?.username &&
                            !participant.isCreator && (
                              <Badge variant="secondary" className="text-xs">
                                나
                              </Badge>
                            )}
                        </div>
                        <div className="flex items-center gap-1">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              participant.status === "studying"
                                ? "bg-green-500"
                                : "bg-orange-500"
                            }`}
                          ></span>
                          <span className="text-xs text-gray-500">
                            {participant.status === "studying"
                              ? "공부중"
                              : "휴식중"}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
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
        <div className="flex-1 flex flex-col">
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
                  onClick={handleTimerReset}
                  className="text-gray-500 hover:text-gray-700"
                >
                  리셋
                </Button>
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
                {messages.filter(m => m.type === "QUESTION" && m.status !== "resolved").length > 0 && (
                  <Popover open={questionListOpen} onOpenChange={setQuestionListOpen}>
                    <PopoverTrigger asChild>
                      <button className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-red-50 to-orange-50 rounded-lg border border-red-200 hover:shadow-md transition-all cursor-pointer">
                        <HelpCircle className="w-4 h-4 text-red-500" />
                        <span className="font-semibold text-red-700">
                          질문 {messages.filter(m => m.type === "QUESTION" && m.status !== "resolved").length}개
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
                            .filter(m => m.type === "QUESTION" && m.status !== "resolved")
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
                                        {question.sender?.charAt(0).toUpperCase()}
                                      </AvatarFallback>
                                    </Avatar>
                                    <span className="font-medium text-sm">
                                      {question.sender}
                                    </span>
                                  </div>
                                  <Badge
                                    variant={question.status === "helping" ? "default" : "destructive"}
                                    className="text-xs"
                                  >
                                    {question.status === "helping" ? "답변 중" : "도움 필요"}
                                  </Badge>
                                </div>
                                <p className="text-sm text-gray-800 line-clamp-2 mb-1">
                                  "{question.content}"
                                </p>
                                {question.answers && question.answers.length > 0 && (
                                  <div className="flex items-center gap-1 text-xs text-blue-600">
                                    <MessageCircle className="w-3 h-3" />
                                    <span>답변 {question.answers.length}개</span>
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
                  <span>총 {formatTime(todayStats.totalStudyTime)}</span>
                </div>
                <div>공부 {todayStats.studySessions}회</div>
                <div>휴식 {todayStats.restSessions}회</div>
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
                {message.type === "SYSTEM" ? (
                  <div className="text-center text-sm text-gray-500 py-2">
                    {message.content}
                  </div>
                ) : message.type === "QUESTION" ? (
                  <div 
                    id={`question-${message.id}`}
                    className="bg-gradient-to-r from-red-50 to-orange-50 rounded-lg p-4 border-l-4 border-red-500 space-y-3 transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-2">
                        <Avatar className="w-8 h-8">
                          {message.senderProfileImage ? (
                            <AvatarImage src={message.senderProfileImage} />
                          ) : null}
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
                            {formatRelativeTime(message.timestamp)}
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
                        <p className="text-gray-900 flex-1">{message.content}</p>
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

                    {message.status === "resolved" && message.answers && message.answers.some(ans => ans.isAccepted) && (
                      <div className="pl-7 space-y-2">
                        <div className="flex items-center gap-2 text-sm font-medium text-green-700">
                          <CheckCircle className="w-4 h-4" />
                          <span>채택된 답변</span>
                        </div>
                        {message.answers.filter(ans => ans.isAccepted).map((answer) => (
                          <div
                            key={answer.id}
                            className="bg-green-50 rounded-lg p-3 border-2 border-green-300 shadow-sm"
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <Avatar className="w-6 h-6">
                                {answer.answererProfileImage ? (
                                  <AvatarImage src={answer.answererProfileImage} />
                                ) : null}
                                <AvatarFallback className="bg-green-500 text-white text-xs">
                                  {answer.answerer.charAt(0).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <span className="font-medium text-sm">
                                {answer.answerer}
                              </span>
                              <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">
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

                    {message.status !== "resolved" && message.answers && message.answers.length > 0 && (
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
                                  {answer.answererProfileImage ? (
                                    <AvatarImage src={answer.answererProfileImage} />
                                  ) : null}
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
    onClick={() => handleAcceptAnswer(message.id, answer.id)}
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
  onClick={() => {
    console.log("🔘 Button clicked, message.id:", message.id, "type:", typeof message.id);
    handleSubmitAnswer(message.id);
  }}
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
                      {message.senderProfileImage ? (
                        <AvatarImage src={message.senderProfileImage} />
                      ) : null}
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
                          {formatRelativeTime(message.timestamp)}
                        </span>
                      </div>

                      <div className="bg-white rounded-lg px-4 py-2 shadow-sm">
                        {message.imageUrl ? (
                          <img
                            src={message.imageUrl}
                            alt="uploaded"
                            className="max-w-xs rounded cursor-pointer hover:opacity-90"
                            onClick={() => window.open(message.imageUrl)}
                          />
                        ) : (
                          <p className="text-gray-900">{message.content}</p>
                        )}
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
                ref={fileInputRef}
                className="hidden"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip"
                onChange={handleFileUpload}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isQuestionMode}
              >
                <Paperclip className="w-5 h-5" />
              </Button>
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
                  value={`${window.location.origin}/#/open-study/room/${roomId}`}
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
              {user &&
              (roomInfo.createdBy === user.id ||
                roomInfo.creatorUsername === user.username)
                ? "방장이 나가면 방이 삭제됩니다. 정말로 나가시겠습니까?"
                : "정말로 스터디룸을 나가시겠습니까?"}
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

export default OpenStudyRoomPage;