import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function POST(req: NextRequest) {
    try {
        const payload = await getCurrentUser();

        if (!payload) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const { currentPassword, newPassword } = await req.json();

        if (!currentPassword || !newPassword) {
            return NextResponse.json(
                { error: 'Current password and new password are required' },
                { status: 400 }
            );
        }

        // Call backend API to change password
        const backendRes = await fetch(`${API_BASE}/api/users/${payload.userId}/change-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword, newPassword }),
        });

        const backendData = await backendRes.json();

        if (!backendRes.ok) {
            return NextResponse.json(
                { error: backendData.detail || 'Failed to change password' },
                { status: backendRes.status }
            );
        }

        return NextResponse.json({
            status: 'success',
            message: 'Password changed successfully',
        });
    } catch (error) {
        console.error('Change password error:', error);
        return NextResponse.json(
            { error: 'Failed to change password' },
            { status: 500 }
        );
    }
}
