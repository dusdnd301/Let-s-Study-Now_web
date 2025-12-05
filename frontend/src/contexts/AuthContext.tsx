import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { User, authAPI } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  register: (data: any) => Promise<boolean>;
  logout: (showToast?: boolean) => Promise<void>; // ✅ 수정 완료
  updateUser: (userData: Partial<User>) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // 앱 시작 시 로그인 상태 확인
  useEffect(() => {
const initAuth = async () => {
  try {
    const token = localStorage.getItem("accessToken");

    // ✅ 토큰 없으면 profile 요청 자체를 안 함
    if (!token) {
      setUser(null);
      return;
    }

    const userData = await authAPI.getProfile();
    setUser(userData);

  } catch (error) {
    console.warn("프로필 조회 실패 (자동 로그아웃 처리):", error);

    // ✅ 잘못된 토큰이면 완전 로그아웃 처리
    localStorage.clear();
    sessionStorage.clear();
    setUser(null);

  } finally {
    setLoading(false);
  }
};
    initAuth();
  }, []);

  // ✅ 이메일 기반 로그인
  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      await authAPI.login({ email, password });

      const userData = await authAPI.getProfile();
      setUser(userData);

      toast({
        title: "로그인 성공 🎉",
        description: `${userData.username}님 환영합니다!`,
      });

      return true;
    } catch (error: any) {
      console.error("Login failed:", error);

      // ✅ error.message에서 에러 메시지 추출 (api.ts에서 처리됨)
      const errorMsg = error?.message || "";

      let description = "로그인 중 오류가 발생했습니다.";

      // 백엔드 에러 메시지에 따라 처리
      if (
        errorMsg.includes("자격 증명") ||
        errorMsg.includes("credentials") ||
        errorMsg.includes("401")
      ) {
        description = "이메일 또는 비밀번호를 확인해주세요.";
      } else if (errorMsg.includes("이메일")) {
        description = "이메일을 확인해주세요.";
      } else if (errorMsg.includes("비밀번호")) {
        description = "비밀번호를 확인해주세요.";
      }

      toast({
        title: "로그인 실패",
        description,
        variant: "destructive",
      });
      return false;
    }
  };

  // ✅ 회원가입
  const register = async (data: any): Promise<boolean> => {
    try {
      await authAPI.register(data);

      toast({
        title: "회원가입 성공 🎉",
        description: "이제 로그인해주세요!",
      });

      return true;
    } catch (error: any) {
      console.error("Registration failed:", error);
      console.error("Error message:", error?.message);

      // ✅ 백엔드 에러 메시지를 그대로 사용
      const errorMsg = error?.message || "";

      // HTTP 상태 코드 제거
      let description = errorMsg
        .replace(/HTTP error! status: \d+\s*/g, "")
        .trim();

      // 메시지가 비어있으면 기본 메시지
      if (!description) {
        description = "입력 정보를 다시 확인해주세요.";
      }

      console.error("Final description:", description);

      toast({
        title: "회원가입 실패",
        description,
        variant: "destructive",
      });

      return false;
    }
  };

  // ✅ 로그아웃
  const logout = async (showToast: boolean = true): Promise<void> => {
  try {
    await authAPI.logout();
  } catch (error) {
    console.warn("Logout request failed:", error);
  } finally {
    // ✅ 토큰 완전 삭제
    localStorage.clear();
    sessionStorage.clear();

    // ✅ 사용자 상태 초기화
    setUser(null);

    // ✅ 일반 로그아웃일 때만 토스트 출력
    if (showToast) {
      toast({
        title: "로그아웃 완료 👋",
        description: "다음에 또 만나요!",
      });
    }
  }
};

  const updateUser = (userData: Partial<User>) => {
    setUser((prev) => (prev ? { ...prev, ...userData } : null));
  };

  const refreshUser = async (): Promise<void> => {
    try {
      const userData = await authAPI.getProfile();
      setUser(userData);
    } catch (error) {
      console.error("Failed to refresh user:", error);
      setUser(null);

      // ✅ 401 에러일 때만 세션 만료 메시지
      const errorMsg = (error as any)?.message || "";
      if (errorMsg.includes("401")) {
        toast({
          title: "세션 만료",
          description: "다시 로그인해주세요.",
          variant: "destructive",
        });
      }
    }
  };

  const value = {
    user,
    loading,
    login,
    register,
    logout,
    updateUser,
    refreshUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
