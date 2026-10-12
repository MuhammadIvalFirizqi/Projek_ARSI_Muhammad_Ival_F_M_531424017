<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Queue\SerializesModels;

/**
 * Disiarkan setiap kali proyek berubah (FR-55).
 * Channel publik per proyek: tanpa login, UUID proyek sulit ditebak.
 */
class ProjectChanged implements ShouldBroadcastNow
{
    use SerializesModels;

    public function __construct(
        public string $projectId,
        public int $revision,
        public array $state,
        public ?string $clientId = null,
        public string $action = 'updated',
        public string $objectType = 'project',
        public ?string $objectId = null,
    ) {
    }

    public function broadcastOn(): array
    {
        return [new Channel('project.'.$this->projectId)];
    }

    public function broadcastAs(): string
    {
        return 'changed';
    }

    public function broadcastWith(): array
    {
        return [
            'project_id' => $this->projectId,
            'revision' => $this->revision,
            'state' => $this->state,
            'client_id' => $this->clientId,
            'action' => $this->action,
            'object_type' => $this->objectType,
            'object_id' => $this->objectId,
        ];
    }
}
