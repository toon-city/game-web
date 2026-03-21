import {
  Component,
  Input,
  OnInit,
  OnDestroy,
  inject,
  signal,
  ViewChild,
  ElementRef,
  AfterViewChecked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgFor } from '@angular/common';
import { RemoteChatMessagePayload } from '@toon-live/game-types';
import { SocketService } from '../../../../core/services/socket.service';
import { AuthService } from '../../../../core/services/auth.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [FormsModule, NgFor],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss'],
})
export class ChatComponent implements OnInit, OnDestroy, AfterViewChecked {
  @Input() roomId = '';
  @ViewChild('msgList') msgListRef!: ElementRef<HTMLDivElement>;

  private socket = inject(SocketService);
  private auth = inject(AuthService);
  private subs: Subscription[] = [];
  private shouldScrollToBottom = false;

  messages = signal<RemoteChatMessagePayload[]>([]);
  historyOpen = signal(false);
  text = '';

  readonly myUserId = () => this.auth.user()?.id ?? '';

  toggleHistory(): void {
    this.historyOpen.update(v => !v);
    if (this.historyOpen()) {
      this.shouldScrollToBottom = true;
    }
  }

  ngOnInit(): void {
    this.subs.push(
      this.socket.chatMessage$.subscribe((msg) => {
        this.messages.update((msgs) => [...msgs, msg]);
        this.shouldScrollToBottom = true;
      }),
    );
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.shouldScrollToBottom = false;
      const el = this.msgListRef?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }

  send(): void {
    const t = this.text.trim();
    if (!t) return;
    this.socket.sendChatMessage(this.roomId, t);
    this.text = '';
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
  }
}
