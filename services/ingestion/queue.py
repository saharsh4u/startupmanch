from __future__ import annotations

import json
from typing import Iterable, List

import boto3

from .config import get_settings
from .models import Task


class SqsQueue:
    def __init__(self):
        settings = get_settings()
        if not settings.sqs_queue_url:
            raise RuntimeError("SQS_QUEUE_URL is required")
        self.queue_url = settings.sqs_queue_url
        self.client = boto3.client("sqs", region_name=settings.aws_region)

    def enqueue(self, task: Task) -> None:
        self.client.send_message(
            QueueUrl=self.queue_url,
            MessageBody=task.model_dump_json()
        )

    def enqueue_many(self, tasks: Iterable[Task]) -> None:
        entries = [
            {
                "Id": str(idx),
                "MessageBody": task.model_dump_json(),
            }
            for idx, task in enumerate(tasks)
        ]
        if not entries:
            return
        self.client.send_message_batch(QueueUrl=self.queue_url, Entries=entries)

    def poll(self, max_messages: int = 5) -> List[dict]:
        response = self.client.receive_message(
            QueueUrl=self.queue_url,
            MaxNumberOfMessages=max_messages,
            WaitTimeSeconds=10,
        )
        return response.get("Messages", [])

    def delete(self, receipt_handle: str) -> None:
        self.client.delete_message(QueueUrl=self.queue_url, ReceiptHandle=receipt_handle)


class LocalQueue:
    def __init__(self):
        self._items: List[str] = []

    def enqueue(self, task: Task) -> None:
        self._items.append(task.model_dump_json())

    def enqueue_many(self, tasks: Iterable[Task]) -> None:
        for task in tasks:
            self.enqueue(task)

    def poll(self, max_messages: int = 5) -> List[dict]:
        items = self._items[:max_messages]
        self._items = self._items[max_messages:]
        return [
            {
                "Body": item,
                "ReceiptHandle": str(idx)
            }
            for idx, item in enumerate(items)
        ]

    def delete(self, receipt_handle: str) -> None:
        return


def parse_task(message: dict) -> Task:
    body = message.get("Body", "{}")
    return Task.model_validate_json(body)
