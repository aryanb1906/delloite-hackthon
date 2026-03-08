import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, createLogoutCookie } from '@/lib/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function DELETE(req: NextRequest) {
    try {
        const payload = await getCurrentUser();

        if (!payload) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Call backend API to delete account
        const backendRes = await fetch(`${API_BASE}/api/users/${payload.userId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
        });

        const backendData = await backendRes.json();

        if (!backendRes.ok) {
            return NextResponse.json(
                { error: backendData.detail || 'Failed to delete account' },
                { status: backendRes.status }
            );
        }

        // Clear auth cookie
        const response = NextResponse.json({
            status: 'success',
            message: 'Account deleted successfully',
        });

        response.headers.set('Set-Cookie', createLogoutCookie());
        return response;
    } catch (error) {
        console.error('Delete account error:', error);
        return NextResponse.json(
            { error: 'Failed to delete account' },
            { status: 500 }
        );
    }
}
