<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Queue\SerializesModels;

/**
 * Penanda kehadiran (FR-59), penanda kegiatan yang sedang diedit (FR-60),
 * dan pratinjau langsung perubahan orang lain (FR-64).
 */
class ProjectPresence implements ShouldBroadcastNow
{
    use SerializesModels;

    public function __construct(
        public string $projectId,
        public string $clientId,
        public string $event,
        public array $payload = [],
    ) {
    }

    public function broadcastOn(): array
    {
        return [new Channel('project.'.$this->projectId)];
    }

    public function broadcastAs(): string
    {
        return 'presence';
    }

    public function broadcastWith(): array
    {
        return [
            'client_id' => $this->clientId,
            'event' => $this->event,
            'payload' => $this->payload,
        ];
    }
}
