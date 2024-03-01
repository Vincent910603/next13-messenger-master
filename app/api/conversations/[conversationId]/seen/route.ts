import { NextResponse } from "next/server";

import getCurrentUser from "@/app/actions/getCurrentUser";
import { pusherServer } from '@/app/libs/pusher'
import prisma from "@/app/libs/prismadb";

interface IParams {
  conversationId?: string;
}

export async function POST(
  request: Request,
  { params }: { params: IParams }
) {
  try {
    const currentUser = await getCurrentUser();
    const {
      conversationId
    } = params;

    
    if (!currentUser?.id || !currentUser?.email) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Find existing conversation
    const conversation = await prisma.conversation.findUnique({
      where: {
        id: conversationId,
      },
      include: {
        messages: {
          include: {
            seen: true
          },
        },
        users: true,
      },
    });

    if (!conversation) {
      return new NextResponse('Invalid ID', { status: 400 });
    }

    // Find last message
    const lastMessage = conversation.messages[conversation.messages.length - 1];

    if (!lastMessage) {
      return NextResponse.json(conversation);
    }

    // Update seen of last message
    const updatedMessage = await prisma.message.update({
      where: {
        id: lastMessage.id
      },
      include: {
        sender: true,
        seen: true,
      },
      data: {
        seen: {
          connect: {
            id: currentUser.id
          }
        }
      }
    });

    // 如果有新的已读，更新所有连接
    await pusherServer.trigger(currentUser.email, 'conversation:update', {
      id: conversationId,
      messages: [updatedMessage]
    });

    // 如果用户已经看到消息，则不需要继续
    if (lastMessage.seenIds.indexOf(currentUser.id) !== -1) {
      return NextResponse.json(conversation);
    }

    // 更新最后一次已读
    await pusherServer.trigger(conversationId!, 'message:update', updatedMessage);

    return new NextResponse('Success');
  } catch (error) {
    console.log(error, 'ERROR_MESSAGES_SEEN')
    return new NextResponse('Error', { status: 500 });
  }
}