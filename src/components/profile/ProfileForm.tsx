'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { ProfilePhotoField } from '@/components/profile/ProfilePhotoField';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ATTENDANCE_ROLES } from '@/types';

export interface ProfileFormValues {
  profile_photo: string;
  attendance_role: string;
  roblox_username: string;
  discord_username: string;
  real_name: string;
}

interface ProfileFormProps {
  initialValues?: Partial<ProfileFormValues>;
  submitLabel?: string;
  onSubmit: (values: ProfileFormValues) => void | Promise<void>;
  isSubmitting?: boolean;
  showRole?: boolean;
  photoOnly?: boolean;
  showRealName?: boolean;
}

export function ProfileForm({
  initialValues,
  submitLabel = 'Simpan & Lanjutkan',
  onSubmit,
  isSubmitting = false,
  showRole = true,
  photoOnly = false,
  showRealName = false,
}: ProfileFormProps) {
  const [profilePhoto, setProfilePhoto] = useState<string>(initialValues?.profile_photo || '');
  const [attendanceRole, setAttendanceRole] = useState<string>(initialValues?.attendance_role || 'CSOT');
  const [robloxUsername, setRobloxUsername] = useState<string>(initialValues?.roblox_username || '');
  const [discordUsername, setDiscordUsername] = useState<string>(initialValues?.discord_username || '');
  const [realName, setRealName] = useState<string>(initialValues?.real_name || '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const hasLocalChanges = useRef(false);

  useEffect(() => {
    if (hasLocalChanges.current) return;
    setProfilePhoto(initialValues?.profile_photo || '');
    setAttendanceRole(initialValues?.attendance_role || 'CSOT');
    setRobloxUsername(initialValues?.roblox_username || '');
    setDiscordUsername(initialValues?.discord_username || '');
    setRealName(initialValues?.real_name || '');
  }, [initialValues]);

  const validate = () => {
    const nextErrors: Record<string, string> = {};

    if (showRealName && !realName.trim()) nextErrors.real_name = 'Nama asli wajib diisi.';
    if (showRealName && realName.trim().length > 100) nextErrors.real_name = 'Nama asli maksimal 100 karakter.';
    if (!photoOnly && !robloxUsername.trim()) nextErrors.roblox_username = 'Username Roblox wajib diisi.';
    if (!photoOnly && !discordUsername.trim()) nextErrors.discord_username = 'Username Discord wajib diisi.';

    if (!photoOnly && showRole && !ATTENDANCE_ROLES.includes(attendanceRole as (typeof ATTENDANCE_ROLES)[number])) {
      nextErrors.attendance_role = 'Role tidak valid.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    await onSubmit({
      profile_photo: profilePhoto,
      attendance_role: attendanceRole,
      roblox_username: robloxUsername.trim(),
      discord_username: discordUsername.trim(),
      real_name: realName.trim(),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className={photoOnly ? 'mx-auto w-full max-w-sm' : 'grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]'}>
        <ProfilePhotoField
          photo={profilePhoto}
          onChange={(photo) => {
            hasLocalChanges.current = true;
            setProfilePhoto(photo);
            setErrors((previous) => ({ ...previous, profile_photo: '' }));
          }}
          error={errors.profile_photo}
        />

        {!photoOnly && <div className="space-y-4">
          {showRealName && (
            <Input
              label="Nama Asli"
              placeholder="Masukkan nama asli"
              value={realName}
              onChange={(e) => {
                hasLocalChanges.current = true;
                setRealName(e.target.value);
              }}
              maxLength={100}
              autoComplete="name"
              required
              error={errors.real_name}
              helperText="Nama asli hanya dapat dilihat oleh Anda dan administrator."
            />
          )}
          {showRole && (
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-700">
                Role
              </label>
              <select
                value={attendanceRole}
                onChange={(e) => {
                  hasLocalChanges.current = true;
                  setAttendanceRole(e.target.value);
                }}
                disabled
                className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none"
              >
                {ATTENDANCE_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500">Role telah ditentukan admin saat akun dibuat dan tidak dapat diubah.</p>
              {errors.attendance_role && (
                <p className="text-xs text-rose-600">{errors.attendance_role}</p>
              )}
            </div>
          )}

          <Input
            label="Username Roblox"
            placeholder="Masukkan username Roblox"
            value={robloxUsername}
            onChange={(e) => {
              hasLocalChanges.current = true;
              setRobloxUsername(e.target.value);
            }}
            error={errors.roblox_username}
          />

          <Input
            label="Username Discord"
            placeholder="Masukkan username Discord"
            value={discordUsername}
            onChange={(e) => {
              hasLocalChanges.current = true;
              setDiscordUsername(e.target.value);
            }}
            error={errors.discord_username}
          />
        </div>}
      </div>

      {!photoOnly && <div className="flex items-center justify-between rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
        <div className="flex items-center gap-2 text-blue-700">
          <ShieldCheck className="h-4 w-4" />
          <span className="text-xs font-medium">Data Anda akan disimpan dan dipakai saat absensi hari ini.</span>
        </div>
      </div>}

      <div className="flex justify-end">
        <Button type="submit" variant="primary" size="lg" isLoading={isSubmitting} loadingText="Menyimpan...">
          {submitLabel}
        </Button>
      </div>

    </form>
  );
}
