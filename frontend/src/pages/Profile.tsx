import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import { authAPI } from "@/lib/api";
import Navbar from "@/components/Navbar";
import { Camera, Lock, Trash2, TrendingUp, Award } from "lucide-react";

const STUDY_FIELDS = [
  "프로그래밍",
  "영어",
  "자격증",
  "공무원",
  "대학입시",
  "취업준비",
  "어학",
  "기타",
];

const Profile: React.FC = () => {
  const { user, refreshUser, logout } = useAuth();
  const [loading, setLoading] = useState(false);
  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");

  const [profileData, setProfileData] = useState({
    bio: "",
    studyField: "",
  });

  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    newPasswordCheck: "",
  });

  const [deletePassword, setDeletePassword] = useState("");

  useEffect(() => {
    if (user) {
      setProfileData({
        bio: user.bio || "",
        studyField: user.studyFields?.[0] || user.studyField || "",
      });
      if (user.profileImageUrl) {
        setImagePreview(user.profileImageUrl);
      }
    }
  }, [user]);

  // ✅ 레벨 계산 (경험치 기반)
  const calculateLevel = (exp: number = 0) => {
    return Math.floor(exp / 100) + 1;
  };

  // ✅ 다음 레벨까지 필요한 경험치
  const getExpForNextLevel = (exp: number = 0) => {
    const currentLevelExp = exp % 100;
    return { current: currentLevelExp, needed: 100 };
  };

  // 이미지 선택 핸들러
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "오류",
          description: "이미지 크기는 5MB를 초과할 수 없습니다.",
          variant: "destructive",
        });
        return;
      }

      setProfileImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // ✅ 프로필 업데이트 (PATCH /api/update/profile)
const handleProfileUpdate = async () => {
  if (!profileData.studyField.trim()) {
    toast({
      title: "오류",
      description: "공부 분야를 선택해주세요.",
      variant: "destructive",
    });
    return;
  }

  setLoading(true);

  try {
    // ✅ FormData 생성
    const formData = new FormData();

    // ✅ 전송할 JSON 데이터 객체
    const dataObj: any = {
      studyField: profileData.studyField,
    };

    if (profileData.bio && profileData.bio.trim()) {
      dataObj.bio = profileData.bio;
    }

    // ✅ 핵심 수정 부분: JSON을 application/json Blob으로 감싸서 전송
    formData.append(
      "data",
      new Blob([JSON.stringify(dataObj)], { type: "application/json" })
    );

    // ✅ image 파일이 있으면 추가 (선택 사항)
    if (profileImage) {
      formData.append("image", profileImage);
    }

    console.log("=== Sending FormData (application/json + multipart) ===");
    console.log("data:", dataObj);
    console.log("image:", profileImage?.name || "없음");

    // ✅ FormData 내부 확인 (디버깅용)
    for (let pair of formData.entries()) {
      console.log(pair[0], pair[1]);
    }

    // ✅ PATCH 요청
    await authAPI.updateProfile(formData);

    toast({
      title: "성공",
      description: "프로필이 업데이트되었습니다.",
    });

    // ✅ 사용자 정보 새로고침
    await refreshUser();
    setProfileImage(null);

  } catch (error: any) {
    console.error("프로필 업데이트 에러:", error);

    toast({
      title: "오류",
      description: error?.message || "프로필 업데이트에 실패했습니다.",
      variant: "destructive",
    });

  } finally {
    setLoading(false);
  }
};


  // ✅ 비밀번호 변경 (PATCH /api/update/password)
  const handlePasswordChange = async () => {
    if (
      !passwordData.currentPassword ||
      !passwordData.newPassword ||
      !passwordData.newPasswordCheck
    ) {
      toast({
        title: "오류",
        description: "모든 필드를 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (passwordData.newPassword.length < 8) {
      toast({
        title: "오류",
        description: "새 비밀번호는 최소 8자 이상이어야 합니다.",
        variant: "destructive",
      });
      return;
    }

    if (passwordData.newPassword !== passwordData.newPasswordCheck) {
      toast({
        title: "오류",
        description: "새 비밀번호가 일치하지 않습니다.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // ✅ PATCH 요청, Response: string
      const response = await authAPI.updatePassword({
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
        newPasswordCheck: passwordData.newPasswordCheck,
      });

      toast({
        title: "성공",
        description:
          typeof response === "string"
            ? response
            : "비밀번호가 변경되었습니다.",
      });

      setPasswordData({
        currentPassword: "",
        newPassword: "",
        newPasswordCheck: "",
      });
    } catch (error: any) {
      toast({
        title: "오류",
        description: error?.message || "비밀번호 변경에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // ✅ 계정 삭제 (DELETE /api/delete/account)
const handleDeleteAccount = async () => {
  if (!deletePassword.trim()) {
    toast({
      title: "오류",
      description: "비밀번호를 입력해주세요.",
      variant: "destructive",
    });
    return;
  }

  if (!confirm("정말로 계정을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) {
    return;
  }

  setLoading(true);
  try {
    const response = await authAPI.deleteAccount(deletePassword);

// ✅ 계정 삭제 성공 메시지 (이건 유지)
toast({
  title: "계정 삭제 완료",
  description:
    typeof response === "string"
      ? response
      : "계정이 성공적으로 삭제되었습니다.",
});

// ✅ ✅ ✅ 로그아웃은 메시지 없이 실행
await logout(false);

// ✅ 로그인 화면 이동
window.location.replace("#/login");

  } catch (error: any) {
    console.error("=== 계정 삭제 에러 ===", error);
    toast({
      title: "오류",
      description: error?.message || "계정 삭제에 실패했습니다.",
      variant: "destructive",
    });
  } finally {
    setLoading(false);
  }
};

  // ✅ 경험치 정보 계산
  const userLevel = user.level || calculateLevel(user.exp || 0);
  const expInfo = getExpForNextLevel(user.exp || 0);
  const expPercentage = (expInfo.current / expInfo.needed) * 100;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">내 프로필</h1>

        {/* ✅ 레벨 & 경험치 카드 */}
        <Card className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-4">
                <Avatar className="w-16 h-16 border-4 border-white shadow-lg">
                  <AvatarImage src={imagePreview} />
                  <AvatarFallback className="text-2xl bg-blue-500 text-white">
                    {user.username.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">
                    {user.username}
                  </h2>
                  <p className="text-sm text-gray-600">{user.email}</p>
                </div>
              </div>
              <Badge variant="default" className="text-xl px-6 py-3">
                <Award className="w-5 h-5 mr-2" />
                Level {userLevel}
              </Badge>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium text-gray-700">경험치</span>
                <span className="text-gray-600">
                  {expInfo.current} / {expInfo.needed} EXP
                </span>
              </div>
              <Progress value={expPercentage} className="h-3" />
              <p className="text-xs text-gray-500 text-right">
                다음 레벨까지 {expInfo.needed - expInfo.current} EXP 필요
              </p>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList>
            <TabsTrigger value="profile">프로필 정보</TabsTrigger>
            <TabsTrigger value="password">비밀번호 변경</TabsTrigger>
            <TabsTrigger value="stats">학습 통계</TabsTrigger>
            <TabsTrigger value="settings">계정 설정</TabsTrigger>
          </TabsList>

          {/* 프로필 정보 탭 */}
          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <CardTitle>프로필 정보</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* 프로필 이미지 */}
                <div className="flex items-center space-x-6">
                  <Avatar className="w-24 h-24">
                    <AvatarImage src={imagePreview} />
                    <AvatarFallback className="text-2xl">
                      {user.username.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <Label
                      htmlFor="profile-image"
                      className="cursor-pointer inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                    >
                      <Camera className="w-4 h-4 mr-2" />
                      이미지 변경
                    </Label>
                    <Input
                      id="profile-image"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageChange}
                    />
                    <p className="text-sm text-gray-500 mt-2">
                      JPG, PNG (최대 5MB)
                    </p>
                  </div>
                </div>

                {/* 기본 정보 (읽기 전용) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>이메일 (로그인 ID)</Label>
                    <Input value={user.email} disabled className="bg-gray-50" />
                    <p className="text-xs text-gray-500 mt-1">
                      이메일은 변경할 수 없습니다.
                    </p>
                  </div>
                  <div>
                    <Label>닉네임</Label>
                    <Input
                      value={user.username}
                      disabled
                      className="bg-gray-50"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      닉네임은 다른 사용자에게 표시됩니다.
                    </p>
                  </div>
                </div>

                {/* 공부 분야 */}
                <div>
                  <Label>공부 분야 *</Label>
                  <select
                    className="w-full mt-1 p-2 border border-gray-300 rounded-md"
                    value={profileData.studyField}
                    onChange={(e) =>
                      setProfileData({
                        ...profileData,
                        studyField: e.target.value,
                      })
                    }
                  >
                    <option value="">공부 분야를 선택하세요</option>
                    {STUDY_FIELDS.map((field) => (
                      <option key={field} value={field}>
                        {field}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 자기소개 */}
                <div>
                  <Label>자기소개</Label>
                  <Textarea
                    placeholder="자신을 소개해주세요..."
                    value={profileData.bio}
                    onChange={(e) =>
                      setProfileData({ ...profileData, bio: e.target.value })
                    }
                    rows={4}
                    maxLength={500}
                  />
                  <p className="text-sm text-gray-500 text-right mt-1">
                    {profileData.bio.length}/500
                  </p>
                </div>

                <Button
                  onClick={handleProfileUpdate}
                  disabled={loading}
                  className="w-full"
                >
                  {loading ? "업데이트 중..." : "프로필 업데이트"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 비밀번호 변경 탭 */}
          <TabsContent value="password">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Lock className="w-5 h-5 mr-2" />
                  비밀번호 변경
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>현재 비밀번호 *</Label>
                  <Input
                    type="password"
                    value={passwordData.currentPassword}
                    onChange={(e) =>
                      setPasswordData({
                        ...passwordData,
                        currentPassword: e.target.value,
                      })
                    }
                    placeholder="현재 비밀번호를 입력하세요"
                  />
                </div>

                <div>
                  <Label>새 비밀번호 *</Label>
                  <Input
                    type="password"
                    value={passwordData.newPassword}
                    onChange={(e) =>
                      setPasswordData({
                        ...passwordData,
                        newPassword: e.target.value,
                      })
                    }
                    placeholder="새 비밀번호 (최소 8자)"
                  />
                </div>

                <div>
                  <Label>새 비밀번호 확인 *</Label>
                  <Input
                    type="password"
                    value={passwordData.newPasswordCheck}
                    onChange={(e) =>
                      setPasswordData({
                        ...passwordData,
                        newPasswordCheck: e.target.value,
                      })
                    }
                    placeholder="새 비밀번호를 다시 입력하세요"
                  />
                </div>

                <Button
                  onClick={handlePasswordChange}
                  disabled={loading}
                  className="w-full"
                >
                  {loading ? "변경 중..." : "비밀번호 변경"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 학습 통계 탭 */}
          <TabsContent value="stats">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <TrendingUp className="w-5 h-5 mr-2" />
                  학습 통계
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* ✅ 레벨 표시 */}
                  <Card className="bg-gradient-to-br from-blue-50 to-blue-100">
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <p className="text-sm text-gray-600">현재 레벨</p>
                        <p className="text-4xl font-bold text-blue-600 mt-2">
                          {userLevel}
                        </p>
                        <p className="text-xs text-gray-500 mt-2">
                          {expInfo.current} / {expInfo.needed} EXP
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-gradient-to-br from-green-50 to-green-100">
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <p className="text-sm text-gray-600">총 학습 시간</p>
                        <p className="text-3xl font-bold text-green-600 mt-2">
                          24h 30m
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-gradient-to-br from-purple-50 to-purple-100">
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <p className="text-sm text-gray-600">참여한 스터디</p>
                        <p className="text-3xl font-bold text-purple-600 mt-2">
                          15회
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="mt-6">
                  <h3 className="font-semibold mb-4">획득한 뱃지</h3>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="text-lg px-3 py-1">
                      🌱 새싹 스터디러
                    </Badge>
                    <Badge variant="secondary" className="text-lg px-3 py-1">
                      📚 열정 학습자
                    </Badge>
                    <Badge variant="secondary" className="text-lg px-3 py-1">
                      ⭐ 꾸준한 도전자
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 계정 설정 탭 */}
          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-red-600">
                  <Trash2 className="w-5 h-5 mr-2" />
                  계정 삭제
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-sm text-red-800">
                    ⚠️ 계정을 삭제하면 모든 데이터가 영구적으로 삭제됩니다. 이
                    작업은 되돌릴 수 없습니다.
                  </p>
                </div>

                <div>
                  <Label>비밀번호 확인 *</Label>
                  <Input
                    type="password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder="계정 삭제를 위해 비밀번호를 입력하세요"
                  />
                </div>

                <Button
                  variant="destructive"
                  onClick={handleDeleteAccount}
                  disabled={loading || !deletePassword.trim()}
                  className="w-full"
                >
                  {loading ? "삭제 중..." : "계정 영구 삭제"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Profile;
